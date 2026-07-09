"""
Live Dashboard — Windows Agent（单文件实现，无其他本地模块依赖）

职责：采集前台窗口（Win32 API）、键鼠空闲、电池、音乐播放信息，
按"变化即报 + 定期心跳"模型 POST 到后端 /api/report。

文件内部分区（对应下方分隔注释）：
  Logging        — 控制台常开，文件日志按天轮转保留 2 天，可配置开关
  Win32 helpers  — GetForegroundWindow / GetLastInputInfo / 音频会话检测
  Music          — EnumWindows 扫描已知音乐进程，从窗口标题解析歌名/歌手
  Config         — config.json 读写与校验（server_url 仅允许 HTTPS 或内网 HTTP）
  Autostart      — 注册表 HKCU\\...\\Run 自启 + 旧版计划任务自动清理迁移
  Settings GUI   — tkinter 设置窗口
  Reporter       — 指数退避 + 连续失败熔断暂停（非阻塞），ISO-8601 UTC 时间戳
  Tray           — pystray 托盘（绿=在线/橙=AFK/灰=离线）
  Monitor loop   — 主循环：AFK 检测（音频播放豁免）、变化上报、心跳

联动关系：
  - 上报格式与后端 packages/backend/src/routes/report.ts 对齐
    （window_title 只用于服务端生成 display_title，原文不落库）
  - 隐私分级、应用名映射全部在服务端完成，本 agent 不做任何映射
  - 配置示例见同目录 config.example.json；部署说明见 README.md
"""

import ctypes
import ctypes.wintypes
from datetime import datetime, timezone
import ipaddress
import json
import logging
import logging.handlers
import os
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
# Win32 API bindings
# ---------------------------------------------------------------------------
user32 = ctypes.windll.user32  # type: ignore[attr-defined]
kernel32 = ctypes.windll.kernel32  # type: ignore[attr-defined]

GetForegroundWindow = user32.GetForegroundWindow
GetForegroundWindow.restype = ctypes.wintypes.HWND

GetWindowTextW = user32.GetWindowTextW
GetWindowTextW.argtypes = [ctypes.wintypes.HWND, ctypes.wintypes.LPWSTR, ctypes.c_int]
GetWindowTextW.restype = ctypes.c_int

GetWindowTextLengthW = user32.GetWindowTextLengthW
GetWindowTextLengthW.argtypes = [ctypes.wintypes.HWND]
GetWindowTextLengthW.restype = ctypes.c_int

GetWindowThreadProcessId = user32.GetWindowThreadProcessId
GetWindowThreadProcessId.argtypes = [ctypes.wintypes.HWND, ctypes.POINTER(ctypes.wintypes.DWORD)]
GetWindowThreadProcessId.restype = ctypes.wintypes.DWORD


class LASTINPUTINFO(ctypes.Structure):
    _fields_ = [
        ("cbSize", ctypes.wintypes.UINT),
        ("dwTime", ctypes.wintypes.DWORD),
    ]

GetLastInputInfo = user32.GetLastInputInfo
GetLastInputInfo.argtypes = [ctypes.POINTER(LASTINPUTINFO)]
GetLastInputInfo.restype = ctypes.wintypes.BOOL

GetTickCount = kernel32.GetTickCount
GetTickCount.restype = ctypes.wintypes.DWORD


def get_idle_seconds() -> float:
    """Return seconds since last keyboard/mouse input."""
    lii = LASTINPUTINFO()
    lii.cbSize = ctypes.sizeof(LASTINPUTINFO)
    if not GetLastInputInfo(ctypes.byref(lii)):
        return 0.0
    now = GetTickCount()
    elapsed_ms = (now - lii.dwTime) & 0xFFFFFFFF
    return elapsed_ms / 1000.0


def is_audio_playing() -> bool:
    """Check if any audio session is currently active (media playing)."""
    try:
        from pycaw.pycaw import AudioUtilities
        sessions = AudioUtilities.GetAllSessions()
        for session in sessions:
            if session.Process and session.State == 1:
                return True
    except Exception:
        pass
    return False


def is_foreground_fullscreen() -> bool:
    """Check if the foreground window is fullscreen."""
    try:
        hwnd = GetForegroundWindow()
        if not hwnd:
            return False
        rect = ctypes.wintypes.RECT()
        if not user32.GetWindowRect(hwnd, ctypes.byref(rect)):
            return False
        w = user32.GetSystemMetrics(0)
        h = user32.GetSystemMetrics(1)
        return (rect.left <= 0 and rect.top <= 0
                and rect.right >= w and rect.bottom >= h)
    except Exception:
        return False


def get_foreground_info() -> tuple[str, str] | None:
    """Return (process_name, window_title) of the current foreground window."""
    hwnd = GetForegroundWindow()
    if not hwnd:
        return None
    length = GetWindowTextLengthW(hwnd)
    if length <= 0:
        return None
    buf = ctypes.create_unicode_buffer(length + 1)
    GetWindowTextW(hwnd, buf, length + 1)
    title = buf.value.strip()
    if not title:
        return None
    pid = ctypes.wintypes.DWORD()
    GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    try:
        proc = psutil.Process(pid.value)
        proc_name = proc.name()
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        proc_name = "unknown"
    return proc_name, title


# ---------------------------------------------------------------------------
# Music detection — scan ALL windows (not just foreground)
# ---------------------------------------------------------------------------
WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.wintypes.BOOL, ctypes.wintypes.HWND, ctypes.wintypes.LPARAM)

EnumWindows = user32.EnumWindows
EnumWindows.argtypes = [WNDENUMPROC, ctypes.wintypes.LPARAM]
EnumWindows.restype = ctypes.wintypes.BOOL

IsWindowVisible = user32.IsWindowVisible
IsWindowVisible.argtypes = [ctypes.wintypes.HWND]
IsWindowVisible.restype = ctypes.wintypes.BOOL

_MUSIC_PROCESS_MAP: dict[str, str] = {
    "spotify.exe": "Spotify",
    "qqmusic.exe": "QQ音乐",
    "cloudmusic.exe": "网易云音乐",
    "foobar2000.exe": "foobar2000",
    "itunes.exe": "Apple Music",
    "applemusic.exe": "Apple Music",
    "kugou.exe": "酷狗音乐",
    "kwmusic.exe": "酷我音乐",
    "aimp.exe": "AIMP",
    "musicbee.exe": "MusicBee",
    "vlc.exe": "VLC",
    "potplayer.exe": "PotPlayer",
    "potplayer64.exe": "PotPlayer",
    "potplayermini.exe": "PotPlayer",
    "potplayermini64.exe": "PotPlayer",
    "wmplayer.exe": "Windows Media Player",
}


def _parse_spotify_title(title: str) -> tuple[str, str] | None:
    if title in ("Spotify", "Spotify Free", "Spotify Premium"):
        return None
    if " - " in title:
        artist, song = title.split(" - ", 1)
        return song.strip(), artist.strip()
    return title, ""


def _parse_dash_title(title: str, app_suffix: str = "") -> tuple[str, str] | None:
    if app_suffix and title.rstrip() == app_suffix:
        return None
    if " - " in title:
        song, artist = title.split(" - ", 1)
        return song.strip(), artist.strip()
    return title, ""


def _parse_foobar_title(title: str) -> tuple[str, str] | None:
    import re
    cleaned = re.sub(r"\s*\[foobar2000[^\]]*\]\s*$", "", title)
    if not cleaned or cleaned == title:
        if " - " in title:
            parts = title.split(" - ", 1)
            return parts[1].strip(), parts[0].strip()
        return title, ""
    if " - " in cleaned:
        artist, song = cleaned.split(" - ", 1)
        return song.strip(), artist.strip()
    return cleaned, ""


def get_music_info() -> dict | None:
    """Scan all windows to find a known music player and extract now-playing info."""
    results: list[tuple[str, str, str]] = []

    def enum_callback(hwnd: int, _lParam: int) -> bool:
        if not IsWindowVisible(hwnd):
            return True
        length = GetWindowTextLengthW(hwnd)
        if length <= 0:
            return True
        buf = ctypes.create_unicode_buffer(length + 1)
        GetWindowTextW(hwnd, buf, length + 1)
        win_title = buf.value.strip()
        if not win_title:
            return True
        pid = ctypes.wintypes.DWORD()
        GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        try:
            proc = psutil.Process(pid.value)
            proc_lower = proc.name().lower()
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            return True
        if proc_lower not in _MUSIC_PROCESS_MAP:
            return True
        app_name = _MUSIC_PROCESS_MAP[proc_lower]
        parsed = None
        if proc_lower == "spotify.exe":
            parsed = _parse_spotify_title(win_title)
        elif proc_lower == "foobar2000.exe":
            parsed = _parse_foobar_title(win_title)
        else:
            parsed = _parse_dash_title(win_title)
        if parsed:
            song, artist = parsed
            results.append((app_name, song, artist))
        return True

    try:
        EnumWindows(WNDENUMPROC(enum_callback), 0)
    except Exception:
        return None

    if not results:
        return None
    app, title, artist = results[0]
    info: dict[str, str] = {"app": app}
    if title:
        info["title"] = title[:256]
    if artist:
        info["artist"] = artist[:256]
    return info


def get_battery_extra() -> dict:
    """Return battery info dict, or empty dict if no battery."""
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


def format_report_target(app_id: str, window_title: str) -> str:
    """Return a shared display string for tray current item and report logs."""
    app = (app_id or "").strip() or "unknown"
    title = (window_title or "").strip()
    if not title or title == app:
        return app
    return f"{app} — {title[:80]}"


# ---------------------------------------------------------------------------
# Config — stored next to the exe for easy cleanup
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
    """Load config.json, return config dict (may be empty on error)."""
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

    for key in ("server_url", "token"):
        value = cfg.get(key, _DEFAULT_CFG[key])
        cfg[key] = value.strip() if isinstance(value, str) else _DEFAULT_CFG[key]

    enable_log = cfg.get("enable_log", _DEFAULT_CFG["enable_log"])
    cfg["enable_log"] = enable_log if isinstance(enable_log, bool) else _DEFAULT_CFG["enable_log"]

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
    """Save config to config.json atomically with restricted permissions."""
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
    """Validate config. Return error message or None if valid."""
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
# Windows autostart
# ---------------------------------------------------------------------------
AUTOSTART_NAME = "LiveDashboardAgent"
AUTOSTART_RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"


def _get_autostart_command() -> str:
    """Return the command line used for login autostart."""
    if getattr(sys, "frozen", False):
        return subprocess.list2cmdline([str(Path(sys.executable).resolve())])
    return subprocess.list2cmdline([sys.executable, str(Path(__file__).resolve())])


def _has_registry_autostart() -> bool:
    """Return whether the current user has a Run-key startup entry."""
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, AUTOSTART_RUN_KEY) as key:
            value, _ = winreg.QueryValueEx(key, AUTOSTART_NAME)
    except FileNotFoundError:
        return False
    except OSError as e:
        log.warning("Autostart registry query failed: %s", e)
        return False
    return isinstance(value, str) and bool(value.strip())


def _set_registry_autostart(enabled: bool) -> bool:
    """Enable/disable login autostart through the current-user Run key."""
    try:
        import winreg
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, AUTOSTART_RUN_KEY) as key:
            if enabled:
                winreg.SetValueEx(
                    key, AUTOSTART_NAME, 0, winreg.REG_SZ, _get_autostart_command()
                )
            else:
                try:
                    winreg.DeleteValue(key, AUTOSTART_NAME)
                except FileNotFoundError:
                    pass
        return True
    except OSError as e:
        log.error("Autostart registry update failed: %s", e)
        return False


def _has_legacy_startup_task() -> bool:
    """Return whether the legacy scheduled task based autostart exists."""
    try:
        result = subprocess.run(
            ["schtasks", "/query", "/tn", AUTOSTART_NAME],
            capture_output=True,
            text=True,
            check=False,
            timeout=5,
        )
    except (OSError, subprocess.SubprocessError) as e:
        log.debug("Autostart task query failed: %s", e)
        return False
    return result.returncode == 0


def _remove_legacy_startup_task() -> bool:
    """Remove the legacy scheduled task if it exists."""
    if not _has_legacy_startup_task():
        return True
    try:
        result = subprocess.run(
            ["schtasks", "/delete", "/tn", AUTOSTART_NAME, "/f"],
            capture_output=True,
            text=True,
            check=False,
            timeout=10,
        )
    except (OSError, subprocess.SubprocessError) as e:
        log.warning("Legacy startup task removal failed: %s", e)
        return False
    if result.returncode == 0:
        return True
    output = (result.stderr or result.stdout).strip()
    if output:
        log.warning("Legacy startup task removal failed: %s", output)
    return False


def is_autostart_enabled() -> bool:
    """Return whether the agent is configured to launch at Windows logon."""
    return _has_registry_autostart() or _has_legacy_startup_task()


def show_message(title: str, message: str, error: bool = False) -> None:
    """Show a best-effort native message box for user-facing actions."""
    try:
        flags = 0x10 if error else 0x40
        ctypes.windll.user32.MessageBoxW(None, message, title, flags)  # type: ignore[attr-defined]
    except Exception:
        log.info("%s: %s", title, message)


# ---------------------------------------------------------------------------
# Settings Dialog
# ---------------------------------------------------------------------------
# 设置窗配色：与 dashboard 网页同一套暖色系，小窗也保持品牌感
_UI_CREAM = "#FFF8E7"     # 窗口底
_UI_CARD = "#FFFDF7"      # 输入区底
_UI_BORDER = "#E8D5C4"    # 描边
_UI_PRIMARY = "#E8A0BF"   # 主粉
_UI_PRIMARY_DARK = "#D98FB0"
_UI_TEXT = "#2D2B2B"
_UI_MUTED = "#8B7E74"


class _Tooltip:
    """极简悬停提示：停留半秒后在控件下方弹出一行大白话解释。"""

    def __init__(self, widget, text: str):
        self.widget = widget
        self.text = text
        self.tip = None
        self._after = None
        widget.bind("<Enter>", self._schedule, add="+")
        widget.bind("<Leave>", self._hide, add="+")
        widget.bind("<ButtonPress>", self._hide, add="+")

    def _schedule(self, _event=None):
        self._cancel()
        self._after = self.widget.after(500, self._show)

    def _cancel(self):
        if self._after:
            self.widget.after_cancel(self._after)
            self._after = None

    def _show(self):
        if self.tip:
            return
        import tkinter as tk
        x = self.widget.winfo_rootx() + 12
        y = self.widget.winfo_rooty() + self.widget.winfo_height() + 6
        self.tip = tk.Toplevel(self.widget)
        self.tip.wm_overrideredirect(True)
        self.tip.wm_geometry(f"+{x}+{y}")
        tk.Label(
            self.tip, text=self.text, justify="left",
            bg=_UI_CARD, fg=_UI_TEXT, relief="solid", bd=1,
            font=("Segoe UI", 9), padx=8, pady=5, wraplength=300,
        ).pack()

    def _hide(self, _event=None):
        self._cancel()
        if self.tip:
            self.tip.destroy()
            self.tip = None


def show_settings_dialog(current_config: dict | None = None) -> dict | None:
    """Show tkinter settings dialog. Returns new config or None if cancelled.

    刻意保持一个小窗口 + 一列字段 + 两个按钮——它只是个上报数据的
    配置入口，优雅够用即可，不做多余的界面。每个字段都带鼠标悬停的
    大白话解释，不让用户对着专业术语猜。
    """
    try:
        import tkinter as tk
        from tkinter import ttk, messagebox
    except ImportError:
        log.error("tkinter 不可用, 请手动编辑 %s", CONFIG_PATH)
        return None

    cfg = current_config or dict(_DEFAULT_CFG)
    result: list[dict | None] = [None]

    root = tk.Tk()
    root.title("Live Dashboard · 设置")
    root.resizable(False, False)
    root.configure(bg=_UI_CREAM)

    style = ttk.Style(root)
    try:
        style.theme_use("clam")
    except Exception:
        pass
    style.configure("Cream.TFrame", background=_UI_CREAM)
    style.configure(
        "Cream.TLabel", background=_UI_CREAM, foreground=_UI_TEXT, font=("Segoe UI", 10)
    )
    style.configure(
        "Muted.TLabel", background=_UI_CREAM, foreground=_UI_MUTED, font=("Segoe UI", 9)
    )
    style.configure(
        "Title.TLabel", background=_UI_CREAM, foreground=_UI_TEXT,
        font=("Segoe UI Semibold", 15),
    )
    style.configure(
        "Cream.TEntry", fieldbackground=_UI_CARD, bordercolor=_UI_BORDER,
        lightcolor=_UI_BORDER, darkcolor=_UI_BORDER, foreground=_UI_TEXT, padding=4,
    )
    style.configure(
        "Cream.TSpinbox", fieldbackground=_UI_CARD, bordercolor=_UI_BORDER,
        lightcolor=_UI_BORDER, darkcolor=_UI_BORDER, foreground=_UI_TEXT,
        arrowcolor=_UI_MUTED, padding=4,
    )
    # 注意：tkinter 字号只接受整数，写小数会让整条样式失效（文字消失）
    style.configure(
        "Cream.TCheckbutton", background=_UI_CREAM, foreground=_UI_TEXT,
        font=("Segoe UI", 9),
    )
    style.map("Cream.TCheckbutton", background=[("active", _UI_CREAM)])

    frame = ttk.Frame(root, padding=(24, 20, 24, 18), style="Cream.TFrame")
    frame.pack(fill="both", expand=True)

    # ── 标题区 ──
    ttk.Label(frame, text="Live Dashboard", style="Title.TLabel").grid(
        row=0, column=0, columnspan=2, sticky="w"
    )
    ttk.Label(
        frame, text="把此刻正在做的事，轻轻放到你的主页上", style="Muted.TLabel"
    ).grid(row=1, column=0, columnspan=2, sticky="w", pady=(1, 14))

    def field(row: int, label: str, tip: str, widget):
        """一行字段：标签 + 控件，两者都挂同一条大白话悬停提示。"""
        lbl = ttk.Label(frame, text=label, style="Cream.TLabel")
        lbl.grid(row=row, column=0, sticky="w", pady=5, padx=(0, 12))
        _Tooltip(lbl, tip)
        _Tooltip(widget, tip)

    url_var = tk.StringVar(value=cfg.get("server_url", ""))
    url_entry = ttk.Entry(frame, textvariable=url_var, width=38, style="Cream.TEntry")
    url_entry.grid(row=2, column=1, sticky="we", pady=5)
    field(2, "服务器地址",
          "你的面板网址（浏览器里打开面板用的那个地址），例如 https://now.example.com",
          url_entry)

    token_var = tk.StringVar(value=cfg.get("token", ""))
    token_entry = ttk.Entry(frame, textvariable=token_var, width=38, show="•", style="Cream.TEntry")
    token_entry.grid(row=3, column=1, sticky="we", pady=5)
    field(3, "Token",
          "这台电脑的专属密钥，要和服务器 .env 里 DEVICE_TOKEN 配置的一致——用来证明上报的人是你",
          token_entry)

    interval_var = tk.IntVar(value=cfg.get("interval_seconds", 5))
    interval_spin = ttk.Spinbox(
        frame, textvariable=interval_var, from_=1, to=300, width=8, style="Cream.TSpinbox"
    )
    interval_spin.grid(row=4, column=1, sticky="w", pady=5)
    field(4, "上报间隔（秒）",
          "每隔几秒看一眼你正在用什么软件、有没有换歌，发给服务器。数字越小网页更新越快，默认 5 秒就很合适",
          interval_spin)

    heartbeat_var = tk.IntVar(value=cfg.get("heartbeat_seconds", 60))
    heartbeat_spin = ttk.Spinbox(
        frame, textvariable=heartbeat_var, from_=10, to=600, width=8, style="Cream.TSpinbox"
    )
    heartbeat_spin.grid(row=5, column=1, sticky="w", pady=5)
    field(5, "心跳间隔（秒）",
          "哪怕你一直开着同一个软件没动过，也每隔这么久向服务器报个平安，让网页知道电脑还在线（不用改）",
          heartbeat_spin)

    idle_var = tk.IntVar(value=cfg.get("idle_threshold_seconds", 300))
    idle_spin = ttk.Spinbox(
        frame, textvariable=idle_var, from_=30, to=3600, width=8, style="Cream.TSpinbox"
    )
    idle_spin.grid(row=6, column=1, sticky="w", pady=5)
    field(6, "离开判定（秒）",
          "键盘鼠标超过这么久没动，就认为你人不在电脑前，网页上会显示「暂时离开」。默认 5 分钟",
          idle_spin)

    log_var = tk.BooleanVar(value=cfg.get("enable_log", False))
    log_check = ttk.Checkbutton(
        frame, text="记录运行日志（排查问题用）", variable=log_var, style="Cream.TCheckbutton"
    )
    log_check.grid(row=7, column=0, columnspan=2, sticky="w", pady=(8, 2))
    _Tooltip(log_check,
             "把运行过程写进日志文件，只在上报出问题需要排查时才打开，平时保持关闭；日志自动只保留 2 天")

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

    def on_test():
        """用输入框里的地址和 Token 真发一次上报，当场告诉用户配置对不对。

        「测试上报」的思路借鉴自社区 fork 作者 @nmb1337（他的 C# 版 agent
        在设置窗里做了同样的一键连通性验证），感谢他的设计——填完配置
        不用保存重启、不用瞎猜 Token 对没对，点一下就知道。
        """
        server_url = url_var.get().strip()
        token = token_var.get().strip()
        if not server_url.startswith(("http://", "https://")):
            messagebox.showerror("测试失败", "服务器地址必须以 http:// 或 https:// 开头", parent=root)
            return
        if not token:
            messagebox.showerror("测试失败", "Token 还没填，先把面板密钥填上再测试", parent=root)
            return

        test_btn.config(state="disabled", text="测试中…")

        def report_result(ok: bool, msg: str):
            test_btn.config(state="normal", text="测试连接")
            if ok:
                messagebox.showinfo("测试成功", msg, parent=root)
            else:
                messagebox.showerror("测试失败", msg, parent=root)

        def worker():
            # 拿真实的当前前台窗口发一条上报——成功后打开面板就能看到自己
            info = None
            try:
                info = get_foreground_info()
            except Exception:
                pass
            app_id, title = info if info else ("live-dashboard-agent.exe", "Live Dashboard 设置")
            try:
                resp = requests.post(
                    server_url.rstrip("/") + "/api/report",
                    json={
                        "app_id": app_id,
                        "window_title": title[:256],
                        "timestamp": datetime.now(timezone.utc)
                        .isoformat(timespec="milliseconds")
                        .replace("+00:00", "Z"),
                    },
                    headers={"Authorization": f"Bearer {token}"},
                    timeout=10,
                )
                if resp.status_code == 200:
                    ok, msg = True, "服务器已收到数据！现在打开面板网页就能看到这台电脑在线了。"
                elif resp.status_code in (401, 403):
                    ok, msg = False, "服务器拒绝了这个 Token——检查它和服务器 .env 里的 DEVICE_TOKEN 是否一字不差。"
                else:
                    ok, msg = False, f"服务器返回了异常状态码 {resp.status_code}，检查地址填的是不是面板本身。"
            except requests.exceptions.Timeout:
                ok, msg = False, "连接超时——服务器没在 10 秒内应答，检查地址是否正确、服务是否在运行。"
            except requests.exceptions.ConnectionError:
                ok, msg = False, "连不上服务器——检查地址有没有写错、服务是否已启动、网络是否通。"
            except Exception as e:
                ok, msg = False, f"测试出错：{e}"
            # tkinter 只能在主线程碰 UI，结果调度回主循环弹窗
            root.after(0, report_result, ok, msg)

        threading.Thread(target=worker, daemon=True).start()

    # ── 按钮区：主操作粉色实心，测试是描边次操作，取消是安静的文字按钮 ──
    btn_frame = ttk.Frame(frame, style="Cream.TFrame")
    btn_frame.grid(row=8, column=0, columnspan=2, sticky="e", pady=(14, 0))
    tk.Button(
        btn_frame, text="取消", command=root.destroy,
        bg=_UI_CREAM, fg=_UI_MUTED, activebackground=_UI_CREAM, activeforeground=_UI_TEXT,
        relief="flat", bd=0, font=("Segoe UI", 10), padx=14, pady=4, cursor="hand2",
    ).pack(side="left", padx=(0, 10))
    test_btn = tk.Button(
        btn_frame, text="测试连接", command=on_test,
        bg=_UI_CARD, fg=_UI_TEXT, activebackground=_UI_CREAM, activeforeground=_UI_TEXT,
        relief="solid", bd=1, font=("Segoe UI", 10), padx=14, pady=3, cursor="hand2",
        highlightbackground=_UI_BORDER,
    )
    test_btn.pack(side="left", padx=(0, 10))
    _Tooltip(test_btn, "用上面填的地址和 Token 真发一次数据试试水——不用先保存，当场告诉你配置对不对")
    tk.Button(
        btn_frame, text="保存并启动", command=on_save,
        bg=_UI_PRIMARY, fg="white", activebackground=_UI_PRIMARY_DARK, activeforeground="white",
        relief="flat", bd=0, font=("Segoe UI Semibold", 10), padx=20, pady=4, cursor="hand2",
    ).pack(side="left")

    # Center on screen
    root.update_idletasks()
    w, h = root.winfo_reqwidth(), root.winfo_reqheight()
    x = (root.winfo_screenwidth() - w) // 2
    y = (root.winfo_screenheight() - h) // 2
    root.geometry(f"+{x}+{y}")
    root.lift()
    root.focus_force()

    root.mainloop()
    return result[0]


# ---------------------------------------------------------------------------
# Reporter
# ---------------------------------------------------------------------------
class Reporter:
    """Handles sending reports to the backend with exponential backoff."""

    MAX_BACKOFF = 60
    PAUSE_AFTER_FAILURES = 5
    PAUSE_DURATION = 300

    def __init__(self, server_url: str, token: str):
        self.endpoint = server_url.rstrip("/") + "/api/report"
        self.token = token
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        })
        self._consecutive_failures = 0
        self._current_backoff = 0
        self._pause_until = 0.0

    def send(self, app_id: str, window_title: str, extra: dict | None = None) -> bool:
        if self.pause_remaining > 0:
            return False

        payload = {
            "app_id": app_id,
            "window_title": window_title[:256],
            "timestamp": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        }
        if extra:
            payload["extra"] = extra
        try:
            resp = self.session.post(self.endpoint, json=payload, timeout=10)
            if resp.status_code in (200, 201, 409):
                self._consecutive_failures = 0
                self._current_backoff = 0
                self._pause_until = 0.0
                return True
            log.warning("Server %d: %s", resp.status_code, resp.text[:200])
        except requests.RequestException as e:
            log.warning("Request failed: %s", e)

        self._consecutive_failures += 1
        if self._current_backoff == 0:
            self._current_backoff = 5
        else:
            self._current_backoff = min(self._current_backoff * 2, self.MAX_BACKOFF)

        if self._consecutive_failures >= self.PAUSE_AFTER_FAILURES:
            log.warning("Failed %d times, pausing %ds", self._consecutive_failures, self.PAUSE_DURATION)
            self._pause_until = time.monotonic() + self.PAUSE_DURATION
            self._consecutive_failures = 0
            self._current_backoff = 0
        return False

    @property
    def backoff(self) -> float:
        return self._current_backoff

    @property
    def pause_remaining(self) -> float:
        remaining = self._pause_until - time.monotonic()
        if remaining <= 0:
            self._pause_until = 0.0
            return 0.0
        return remaining

    @property
    def retry_delay(self) -> float:
        return self.pause_remaining or self.backoff


# ---------------------------------------------------------------------------
# System Tray
# ---------------------------------------------------------------------------
shutdown_event = threading.Event()


def _make_tray_icon(color: str = "green") -> "PIL.Image.Image":
    """Generate a colored circle icon for the system tray."""
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
        self._current_target = ""
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
            p.MenuItem(lambda _: f"当前: {self._get_current() or '无'}", None, enabled=False),
            p.Menu.SEPARATOR,
            p.MenuItem("日志文件", self._toggle_log,
                       checked=lambda _: _file_handler is not None),
            p.MenuItem("开机自启", self._toggle_autostart,
                       checked=lambda _: is_autostart_enabled()),
            p.MenuItem("设置", self._open_settings),
            p.Menu.SEPARATOR,
            p.MenuItem("退出", self._quit),
        )

    def _get_status(self) -> str:
        with self._lock:
            return self._status

    def _get_current(self) -> str:
        with self._lock:
            return self._current_target

    def update_status(self, status: str, current_target: str | None = None):
        with self._lock:
            self._status = status
            if current_target is not None:
                self._current_target = current_target
            current_target_value = self._current_target
        if self._icon:
            color = {"在线": "green", "AFK": "orange"}.get(status, "gray")
            self._icon.icon = self._icons[color]
            # Hover tooltip — shows current app + status
            tip = "Live Dashboard"
            if current_target_value:
                tip += f"\n当前: {current_target_value}"
            tip += f"\n{status}"
            self._icon.title = tip[:127]

    def _toggle_log(self):
        enabled = _file_handler is None
        set_file_logging(enabled)
        cfg = load_config()
        cfg["enable_log"] = enabled
        save_config(cfg)
        if self._icon:
            self._icon.update_menu()

    def _toggle_autostart(self):
        enabled = is_autostart_enabled()
        if enabled:
            registry_ok = _set_registry_autostart(False)
            legacy_ok = _remove_legacy_startup_task()
            if registry_ok and legacy_ok:
                log.info("Autostart disabled")
            else:
                show_message(
                    "Live Dashboard",
                    "关闭开机自启时未能清理全部启动项。\n请检查任务计划程序中的 LiveDashboardAgent。",
                    error=True,
                )
        else:
            if _set_registry_autostart(True):
                log.info("Autostart enabled")
            else:
                show_message(
                    "Live Dashboard",
                    "无法开启开机自启，请检查当前账户是否有写入启动项的权限。",
                    error=True,
                )
        if self._icon:
            self._icon.update_menu()

    def _open_settings(self):
        self._settings_requested = True
        if self._icon:
            self._icon.stop()

    def _quit(self):
        shutdown_event.set()
        if self._icon:
            self._icon.stop()
        logging.shutdown()
        os._exit(0)

    @property
    def settings_requested(self) -> bool:
        return self._settings_requested

    def run(self):
        """Run the tray icon (blocking — call from main thread)."""
        icon_path = base_dir / "icon.ico"
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
                    idle_target = format_report_target("idle", "User is away")
                    if reporter.send("idle", "User is away", extra):
                        prev_app = "idle"
                        prev_title = "User is away"
                        last_report_time = now
                        if tray:
                            tray.update_status("AFK", idle_target)
                    elif reporter.retry_delay > 0:
                        shutdown_event.wait(reporter.retry_delay)
                        continue
                shutdown_event.wait(interval)
                continue

            info = get_foreground_info()
            if info is None:
                shutdown_event.wait(interval)
                continue

            app_id, title = info

            # Keep tray status responsive; current item is updated only after a successful report.
            if tray:
                tray.update_status("在线")

            changed = app_id != prev_app or title != prev_title
            heartbeat_due = (now - last_report_time) >= heartbeat_interval

            if changed or heartbeat_due:
                extra = get_battery_extra()
                music = get_music_info()
                if music:
                    extra["music"] = music
                reported_target = format_report_target(app_id, title)
                success = reporter.send(app_id, title, extra)
                if success:
                    prev_app = app_id
                    prev_title = title
                    last_report_time = now
                    if tray:
                        tray.update_status("在线", reported_target)
                    if changed:
                        log.info("Reported: %s", reported_target)
                elif reporter.retry_delay > 0:
                    shutdown_event.wait(reporter.retry_delay)
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
    log.info("Live Dashboard Windows Agent")

    while True:
        cfg = load_config()

        # No valid config → show settings dialog
        if not cfg.get("server_url") or not cfg.get("token") or cfg.get("token") == "YOUR_TOKEN_HERE":
            cfg = show_settings_dialog(cfg)
            if cfg is None:
                return
            cfg = load_config()

        err = validate_config(cfg)
        if err:
            log.warning("Invalid config: %s", err)
            cfg = show_settings_dialog(cfg)
            if cfg is None:
                return
            cfg = load_config()
            continue

        # Apply log preference
        set_file_logging(cfg.get("enable_log", False))
        if cfg.get("enable_log"):
            server_url = cfg.get("server_url") or ""
            if not isinstance(server_url, str):
                server_url = ""
            log.info("HTTP: %s", "HTTPS" if server_url.startswith("https") else "HTTP (内网)")

        # Clean up legacy scheduled task autostart (migrated to registry-based)
        # This is critical to prevent duplicate autostart entries
        if _has_legacy_startup_task():
            log.info("Removing legacy scheduled task autostart...")
            if not _remove_legacy_startup_task():
                show_message(
                    "Live Dashboard",
                    "检测到旧版自启动计划任务，但删除失败。\n"
                    "请手动删除任务计划程序中的 'LiveDashboardAgent' 任务，\n"
                    "否则可能出现重复启动。",
                    error=True,
                )

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
            tray.run()  # Blocks until quit or settings
            shutdown_event.set()
            monitor.join(timeout=5)

            if tray.settings_requested:
                shutdown_event.clear()
                new_cfg = show_settings_dialog(cfg)
                if new_cfg is None:
                    continue  # Cancelled, restart with old config
                continue  # Restart with new config
            else:
                break  # Quit
        else:
            try:
                _monitor_loop(cfg, reporter, None)
            except KeyboardInterrupt:
                pass
            break

    log.info("Agent stopped")


if __name__ == "__main__":
    main()
