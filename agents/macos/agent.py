"""
Live Dashboard — macOS Agent
Monitors the foreground window and reports app usage to the dashboard backend.

Requirements:
  pip install psutil requests pystray Pillow

Permissions:
  System Preferences → Privacy & Security → Accessibility → add Terminal
"""

import ipaddress
import json
import logging
import logging.handlers
import os
import shlex
import re
import socket
import subprocess
import sys
import threading
import time
import urllib.parse
from pathlib import Path

import psutil
import requests

if getattr(sys, "frozen", False):
    base_dir = Path(sys.executable).parent
else:
    base_dir = Path(__file__).parent

# ---------------------------------------------------------------------------
# Logging — console always; file handler toggleable (2-day rotation)
# ---------------------------------------------------------------------------
LOG_FILE = base_dir / "agent.log"
_file_handler: logging.Handler | None = None

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()],
)
log = logging.getLogger("agent")


def set_file_logging(enabled: bool) -> None:
    """Toggle file logging with 2-day rotation."""
    global _file_handler
    if enabled and _file_handler is None:
        _file_handler = logging.handlers.TimedRotatingFileHandler(
            LOG_FILE, when="midnight", backupCount=1, encoding="utf-8",
        )
        _file_handler.setFormatter(
            logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
        )
        logging.getLogger().addHandler(_file_handler)
    elif not enabled and _file_handler is not None:
        logging.getLogger().removeHandler(_file_handler)
        _file_handler.close()
        _file_handler = None


# ---------------------------------------------------------------------------
# macOS window info via AppleScript
# ---------------------------------------------------------------------------
_APPLESCRIPT = """\
tell application "System Events"
    set frontApp to first application process whose frontmost is true
    set appName to name of frontApp
    set windowTitle to ""
    try
        set windowTitle to name of front window of frontApp
    end try
    return appName & "|SEP|" & windowTitle
end tell
"""


def get_foreground_info() -> tuple[str, str] | None:
    """Return (process_name, window_title) of the current foreground window."""
    try:
        result = subprocess.run(
            ["osascript", "-e", _APPLESCRIPT],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode != 0:
            return None
        output = result.stdout.strip()
        if "|SEP|" not in output:
            return None
        app_name, window_title = output.split("|SEP|", 1)
        app_name = app_name.strip()
        if not app_name:
            return None
        return app_name, window_title.strip()
    except (subprocess.TimeoutExpired, Exception):
        return None


# ---------------------------------------------------------------------------
# Idle detection via IOKit
# ---------------------------------------------------------------------------
def get_idle_seconds() -> float:
    """Return seconds since last keyboard/mouse input using ioreg."""
    try:
        result = subprocess.run(
            ["ioreg", "-c", "IOHIDSystem", "-d", "4"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode != 0:
            return 0.0
        for line in result.stdout.splitlines():
            if "HIDIdleTime" in line:
                match = re.search(r"=\s*(\d+)", line)
                if match:
                    return int(match.group(1)) / 1_000_000_000
    except Exception:
        pass
    return 0.0


# ---------------------------------------------------------------------------
# Audio playback detection via power assertions
# ---------------------------------------------------------------------------
def is_audio_playing() -> bool:
    """Check if any audio output is currently active on macOS."""
    try:
        result = subprocess.run(
            ["pmset", "-g", "assertions"],
            capture_output=True, text=True, timeout=5,
        )
        if result.returncode != 0:
            return False
        for line in result.stdout.splitlines():
            lower = line.lower()
            if "preventuseridlesleep" in lower and "coreaudiod" in lower:
                return True
    except Exception:
        pass
    return False


# ---------------------------------------------------------------------------
# Fullscreen detection via AXFullScreen attribute
# ---------------------------------------------------------------------------
_FULLSCREEN_SCRIPT = """\
tell application "System Events"
    set frontProc to first application process whose frontmost is true
    try
        set frontWin to first window of frontProc
        set fs to value of attribute "AXFullScreen" of frontWin
        if fs then return "YES"
    end try
end tell
return "NO"
"""


def is_foreground_fullscreen() -> bool:
    """Check if the foreground window is in macOS fullscreen mode."""
    try:
        result = subprocess.run(
            ["osascript", "-e", _FULLSCREEN_SCRIPT],
            capture_output=True, text=True, timeout=5,
        )
        return result.stdout.strip() == "YES"
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Battery info
# ---------------------------------------------------------------------------
def get_battery_extra() -> dict:
    try:
        battery = psutil.sensors_battery()
        if battery is None:
            return {}
        return {
            "battery_percent": int(battery.percent),
            "battery_charging": bool(battery.power_plugged),
        }
    except Exception:
        return {}


# ---------------------------------------------------------------------------
# Music detection via AppleScript
# ---------------------------------------------------------------------------
_MUSIC_APPS = {
    "Spotify": """\
tell application "System Events"
    if not (exists process "Spotify") then return "NOT_RUNNING"
end tell
tell application "Spotify"
    if player state is not playing then return "NOT_PLAYING"
    set t to name of current track
    set a to artist of current track
    return t & "|SEP|" & a
end tell""",
    "Music": """\
tell application "System Events"
    if not (exists process "Music") then return "NOT_RUNNING"
end tell
tell application "Music"
    if player state is not playing then return "NOT_PLAYING"
    set t to name of current track
    set a to artist of current track
    return t & "|SEP|" & a
end tell""",
    "QQ音乐": """\
tell application "System Events"
    if not (exists process "QQMusic") then return "NOT_RUNNING"
    tell process "QQMusic"
        set t to title of front window
    end tell
    return t
end tell""",
    "网易云音乐": """\
tell application "System Events"
    if not (exists process "NeteaseMusic") then return "NOT_RUNNING"
    tell process "NeteaseMusic"
        set t to title of front window
    end tell
    return t
end tell""",
}


def get_music_info() -> dict | None:
    for app_name, script in _MUSIC_APPS.items():
        try:
            result = subprocess.run(
                ["osascript", "-e", script],
                capture_output=True, text=True, timeout=3,
            )
            if result.returncode != 0:
                continue
            output = result.stdout.strip()
            if output in ("NOT_RUNNING", "NOT_PLAYING", ""):
                continue
            info: dict[str, str] = {"app": app_name}
            if "|SEP|" in output:
                title, artist = output.split("|SEP|", 1)
                if title.strip():
                    info["title"] = title.strip()[:256]
                if artist.strip():
                    info["artist"] = artist.strip()[:256]
            else:
                if " - " in output:
                    song, artist = output.split(" - ", 1)
                    info["title"] = song.strip()[:256]
                    info["artist"] = artist.strip()[:256]
                else:
                    info["title"] = output[:256]
            return info
        except (subprocess.TimeoutExpired, Exception):
            continue
    return None


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
CONFIG_PATH = base_dir / "config.json"

_DEFAULT_CFG = {
    "server_url": "",
    "token": "",
    "interval_seconds": 5,
    "heartbeat_seconds": 60,
    "idle_threshold_seconds": 300,
    "enable_log": False,
}


def load_config() -> dict:
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            cfg = json.load(f)
    except FileNotFoundError:
        return dict(_DEFAULT_CFG)
    except (PermissionError, json.JSONDecodeError) as e:
        log.error("config.json: %s", e)
        return dict(_DEFAULT_CFG)

    if not isinstance(cfg, dict):
        return dict(_DEFAULT_CFG)

    for key, default, lo, hi in [
        ("interval_seconds", 5, 1, 300),
        ("heartbeat_seconds", 60, 10, 600),
        ("idle_threshold_seconds", 300, 30, 3600),
    ]:
        val = cfg.get(key, default)
        if not isinstance(val, (int, float)) or val < lo or val > hi:
            val = default
        cfg[key] = int(val)
    return cfg


def save_config(cfg: dict) -> bool:
    import tempfile
    try:
        data = json.dumps(cfg, indent=2, ensure_ascii=False).encode("utf-8")
        fd = tempfile.NamedTemporaryFile(
            dir=CONFIG_PATH.parent, prefix=".config_", suffix=".tmp",
            delete=False,
        )
        tmp_path = Path(fd.name)
        try:
            fd.write(data)
            fd.flush()
            os.fsync(fd.fileno())
            fd.close()
            os.chmod(tmp_path, 0o600)
            tmp_path.replace(CONFIG_PATH)
        except BaseException:
            fd.close()
            tmp_path.unlink(missing_ok=True)
            raise
        return True
    except Exception as e:
        log.error("Config save failed: %s", e)
        return False


def validate_config(cfg: dict) -> str | None:
    url = cfg.get("server_url", "").strip()
    token = cfg.get("token", "").strip()
    if not url:
        return "服务器地址不能为空"
    if not token or token == "YOUR_TOKEN_HERE":
        return "Token 不能为空"

    parsed = urllib.parse.urlparse(url)
    scheme = parsed.scheme.lower()
    hostname = parsed.hostname
    if scheme not in ("http", "https"):
        return "服务器地址必须使用 http:// 或 https://"
    if not hostname:
        return "服务器地址无效"

    if scheme == "http":
        try:
            addrinfos = socket.getaddrinfo(hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
        except socket.gaierror:
            return f"无法解析域名: {hostname}"
        for info in addrinfos:
            ip = ipaddress.ip_address(info[4][0])
            if ip.is_global:
                return "HTTP 仅允许内网地址, 公网请使用 HTTPS"
    return None


# ---------------------------------------------------------------------------
# Settings Dialog
# ---------------------------------------------------------------------------
def show_settings_dialog(current_config: dict | None = None) -> dict | None:
    try:
        import tkinter as tk
        from tkinter import ttk, messagebox
    except ImportError:
        log.error("tkinter 不可用, 请手动编辑 %s", CONFIG_PATH)
        return None

    cfg = current_config or dict(_DEFAULT_CFG)
    result: list[dict | None] = [None]

    root = tk.Tk()
    root.title("Live Dashboard - 设置")
    root.resizable(False, False)

    frame = ttk.Frame(root, padding=20)
    frame.pack(fill="both", expand=True)

    ttk.Label(frame, text="服务器地址:").grid(row=0, column=0, sticky="w", pady=6)
    url_var = tk.StringVar(value=cfg.get("server_url", ""))
    ttk.Entry(frame, textvariable=url_var, width=45).grid(row=0, column=1, pady=6, padx=(8, 0))

    ttk.Label(frame, text="Token:").grid(row=1, column=0, sticky="w", pady=6)
    token_var = tk.StringVar(value=cfg.get("token", ""))
    ttk.Entry(frame, textvariable=token_var, width=45, show="*").grid(row=1, column=1, pady=6, padx=(8, 0))

    ttk.Label(frame, text="上报间隔 (秒):").grid(row=2, column=0, sticky="w", pady=6)
    interval_var = tk.IntVar(value=cfg.get("interval_seconds", 5))
    ttk.Spinbox(frame, textvariable=interval_var, from_=1, to=300, width=10).grid(row=2, column=1, sticky="w", pady=6, padx=(8, 0))

    ttk.Label(frame, text="心跳间隔 (秒):").grid(row=3, column=0, sticky="w", pady=6)
    heartbeat_var = tk.IntVar(value=cfg.get("heartbeat_seconds", 60))
    ttk.Spinbox(frame, textvariable=heartbeat_var, from_=10, to=600, width=10).grid(row=3, column=1, sticky="w", pady=6, padx=(8, 0))

    ttk.Label(frame, text="AFK 判定 (秒):").grid(row=4, column=0, sticky="w", pady=6)
    idle_var = tk.IntVar(value=cfg.get("idle_threshold_seconds", 300))
    ttk.Spinbox(frame, textvariable=idle_var, from_=30, to=3600, width=10).grid(row=4, column=1, sticky="w", pady=6, padx=(8, 0))

    log_var = tk.BooleanVar(value=cfg.get("enable_log", False))
    ttk.Checkbutton(frame, text="开启日志文件 (保留 2 天)", variable=log_var).grid(
        row=5, column=0, columnspan=2, sticky="w", pady=6
    )

    def on_save():
        new_cfg = {
            "server_url": url_var.get().strip(),
            "token": token_var.get().strip(),
            "interval_seconds": interval_var.get(),
            "heartbeat_seconds": heartbeat_var.get(),
            "idle_threshold_seconds": idle_var.get(),
            "enable_log": log_var.get(),
        }
        err = validate_config(new_cfg)
        if err:
            messagebox.showerror("配置错误", err, parent=root)
            return
        if save_config(new_cfg):
            result[0] = new_cfg
            root.destroy()
        else:
            messagebox.showerror("保存失败", "无法写入 config.json", parent=root)

    btn_frame = ttk.Frame(frame)
    btn_frame.grid(row=6, column=0, columnspan=2, pady=16)
    ttk.Button(btn_frame, text="保存", command=on_save).pack(side="left", padx=12)
    ttk.Button(btn_frame, text="取消", command=root.destroy).pack(side="left", padx=12)

    root.update_idletasks()
    w, h = root.winfo_reqwidth(), root.winfo_reqheight()
    x = (root.winfo_screenwidth() - w) // 2
    y = (root.winfo_screenheight() - h) // 2
    root.geometry(f"+{x}+{y}")
    root.lift()
    root.focus_force()

    root.mainloop()
    return result[0]


def open_settings_in_subprocess() -> bool:
    """
    Open settings UI in a separate process to avoid pystray(AppKit) + Tk re-init
    crashes on macOS. Returns True when config was saved.
    """
    try:
        if getattr(sys, "frozen", False):
            cmd = [sys.executable, "--settings-dialog"]
        else:
            cmd = [sys.executable, str(Path(__file__).resolve()), "--settings-dialog"]
        result = subprocess.run(cmd, check=False)
        return result.returncode == 0
    except Exception as e:
        log.error(
            "Failed to open settings subprocess: %s (cmd=%s)",
            e,
            " ".join(shlex.quote(c) for c in cmd),
        )
        return False


# ---------------------------------------------------------------------------
# Reporter
# ---------------------------------------------------------------------------
class Reporter:
    MAX_BACKOFF = 60
    PAUSE_AFTER_FAILURES = 5
    PAUSE_DURATION = 300

    def __init__(self, server_url: str, token: str):
        self.endpoint = server_url.rstrip("/") + "/api/report"
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        })
        self._consecutive_failures = 0
        self._current_backoff = 0

    def send(self, app_id: str, window_title: str, extra: dict | None = None) -> bool:
        payload = {
            "app_id": app_id,
            "window_title": window_title[:256],
            "timestamp": int(time.time() * 1000),
        }
        if extra:
            payload["extra"] = extra
        try:
            resp = self.session.post(self.endpoint, json=payload, timeout=10)
            if resp.status_code in (200, 201, 409):
                self._consecutive_failures = 0
                self._current_backoff = 0
                return True
            log.warning("Server %d: %s", resp.status_code, resp.text[:200])
        except requests.RequestException as e:
            log.warning("Request failed: %s", e)

        self._consecutive_failures += 1
        self._current_backoff = (
            5 if self._current_backoff == 0
            else min(self._current_backoff * 2, self.MAX_BACKOFF)
        )
        if self._consecutive_failures >= self.PAUSE_AFTER_FAILURES:
            log.warning("Failed %d times, pausing %ds", self._consecutive_failures, self.PAUSE_DURATION)
            time.sleep(self.PAUSE_DURATION)
            self._consecutive_failures = 0
            self._current_backoff = 0
        return False

    @property
    def backoff(self) -> float:
        return self._current_backoff


# ---------------------------------------------------------------------------
# System Tray
# ---------------------------------------------------------------------------
shutdown_event = threading.Event()


def _make_tray_icon(color: str = "green") -> "PIL.Image.Image":
    from PIL import Image, ImageDraw
    size = 64
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    colors = {"green": (76, 175, 80), "orange": (255, 152, 0), "gray": (158, 158, 158)}
    rgb = colors.get(color, colors["gray"])
    draw.ellipse([8, 8, size - 8, size - 8], fill=(*rgb, 255))
    return img


class TrayAgent:
    """System tray with Chinese UI, hover tooltip, and integrated settings."""

    def __init__(self):
        import pystray
        self._pystray = pystray
        self._lock = threading.Lock()
        self._status = "初始化中"
        self._current_app = ""
        self._icon: pystray.Icon | None = None
        self._settings_requested = False
        self._icons = {
            "green": _make_tray_icon("green"),
            "orange": _make_tray_icon("orange"),
            "gray": _make_tray_icon("gray"),
        }

    def _build_menu(self):
        p = self._pystray
        return p.Menu(
            p.MenuItem(lambda _: f"状态: {self._get_status()}", None, enabled=False),
            p.MenuItem(lambda _: f"当前: {self._get_app() or '无'}", None, enabled=False),
            p.Menu.SEPARATOR,
            p.MenuItem("日志文件", self._toggle_log,
                       checked=lambda _: _file_handler is not None),
            p.MenuItem("设置", self._open_settings),
            p.Menu.SEPARATOR,
            p.MenuItem("退出", self._quit),
        )

    def _get_status(self) -> str:
        with self._lock:
            return self._status

    def _get_app(self) -> str:
        with self._lock:
            return self._current_app

    def update_status(self, status: str, app_name: str = ""):
        with self._lock:
            self._status = status
            self._current_app = app_name
        if self._icon:
            color = {"在线": "green", "AFK": "orange"}.get(status, "gray")
            try:
                self._icon.icon = self._icons[color]
                tip = "Live Dashboard"
                if app_name:
                    tip += f"\n当前: {app_name}"
                tip += f"\n{status}"
                self._icon.title = tip[:127]
                self._icon.update_menu()
            except Exception as e:
                log.debug("Tray refresh failed: %s", e)

    def _toggle_log(self):
        enabled = _file_handler is None
        set_file_logging(enabled)
        cfg = load_config()
        cfg["enable_log"] = enabled
        save_config(cfg)

    def _open_settings(self):
        self._settings_requested = True
        if self._icon:
            self._icon.stop()

    def _quit(self):
        shutdown_event.set()
        if self._icon:
            self._icon.stop()

    @property
    def settings_requested(self) -> bool:
        return self._settings_requested

    def run(self):
        icon_path = base_dir / "icon.icns"
        if icon_path.exists():
            from PIL import Image
            with Image.open(icon_path) as im:
                icon_img = im.copy()
        else:
            icon_img = _make_tray_icon("gray")
        self._icon = self._pystray.Icon(
            "live-dashboard",
            icon_img,
            "Live Dashboard",
            menu=self._build_menu(),
        )
        self._icon.run()


# ---------------------------------------------------------------------------
# Monitor loop
# ---------------------------------------------------------------------------
def _monitor_loop(cfg: dict, reporter: Reporter, tray: TrayAgent | None) -> None:
    interval = cfg["interval_seconds"]
    heartbeat_interval = cfg["heartbeat_seconds"]
    idle_threshold = cfg["idle_threshold_seconds"]

    prev_app: str | None = None
    prev_title: str | None = None
    last_report_time: float = 0
    was_idle = False

    log.info(
        "Monitoring — interval=%ds, heartbeat=%ds, idle=%ds",
        interval, heartbeat_interval, idle_threshold,
    )
    if tray:
        tray.update_status("在线")

    while not shutdown_event.is_set():
        try:
            now = time.time()

            idle_secs = get_idle_seconds()
            is_idle = (idle_secs >= idle_threshold
                       and not is_audio_playing()
                       and not is_foreground_fullscreen())

            if is_idle and not was_idle:
                log.info("User idle (%.0fs)", idle_secs)
                was_idle = True
                if tray:
                    tray.update_status("AFK")
            elif not is_idle and was_idle:
                log.info("User returned")
                was_idle = False

            if is_idle:
                heartbeat_due = (now - last_report_time) >= heartbeat_interval
                if heartbeat_due:
                    extra = get_battery_extra()
                    if reporter.send("idle", "User is away", extra):
                        last_report_time = now
                shutdown_event.wait(interval)
                continue

            info = get_foreground_info()
            if info is None:
                shutdown_event.wait(interval)
                continue

            app_id, title = info

            # Update tray tooltip on EVERY cycle for instant feedback
            if tray:
                tray.update_status("在线", app_id)

            changed = app_id != prev_app or title != prev_title
            heartbeat_due = (now - last_report_time) >= heartbeat_interval

            if changed or heartbeat_due:
                extra = get_battery_extra()
                music = get_music_info()
                if music:
                    extra["music"] = music
                success = reporter.send(app_id, title, extra)
                if success:
                    prev_app = app_id
                    prev_title = title
                    last_report_time = now
                    if changed:
                        log.info("Reported: %s — %s", app_id, title[:80])
                elif reporter.backoff > 0:
                    shutdown_event.wait(reporter.backoff)
                    continue

            shutdown_event.wait(interval)

        except Exception as e:
            log.error("Error: %s", e, exc_info=True)
            shutdown_event.wait(interval)

    log.info("Monitor stopped")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> None:
    log.info("Live Dashboard macOS Agent")

    if "--settings-dialog" in sys.argv:
        cfg = load_config()
        new_cfg = show_settings_dialog(cfg)
        raise SystemExit(0 if new_cfg is not None else 1)

    while True:
        cfg = load_config()

        if not cfg.get("server_url") or not cfg.get("token") or cfg.get("token") == "YOUR_TOKEN_HERE":
            if not open_settings_in_subprocess():
                return
            cfg = load_config()

        err = validate_config(cfg)
        if err:
            log.warning("Invalid config: %s", err)
            if not open_settings_in_subprocess():
                return
            cfg = load_config()
            continue

        set_file_logging(cfg.get("enable_log", False))

        reporter = Reporter(cfg["server_url"], cfg["token"])

        tray: TrayAgent | None = None
        try:
            tray = TrayAgent()
        except ImportError:
            log.warning("pystray/Pillow not installed, running without tray")
        except Exception as e:
            log.warning("Tray init failed: %s", e)

        if tray:
            monitor = threading.Thread(
                target=_monitor_loop, args=(cfg, reporter, tray), daemon=True
            )
            monitor.start()
            tray.run()
            shutdown_event.set()
            monitor.join(timeout=5)

            if tray.settings_requested:
                shutdown_event.clear()
                if not open_settings_in_subprocess():
                    continue
                continue
            else:
                break
        else:
            try:
                _monitor_loop(cfg, reporter, None)
            except KeyboardInterrupt:
                pass
            break

    log.info("Agent stopped")


if __name__ == "__main__":
    main()
