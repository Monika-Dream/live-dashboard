"""
Live Dashboard 的 Linux Agent（单文件实现，无其他本地模块依赖，issue #46）。
负责监听前台窗口，并把使用状态上报到后端。

文件内部分区（对应下方分隔注释）：
  日志       — 控制台常开，文件日志按天轮转保留 2 天，可配置开关
  会话探测   — 启动时探测一次窗口/空闲/音乐的可用通道并缓存
  窗口信息   — 分层检测：Sway(swaymsg) / Hyprland(hyprctl) / X11(xprop)；
               纯 Wayland 的 GNOME/KDE 无公开前台窗口接口，退 XWayland 兜底
  空闲检测   — xprintidle → GNOME Mutter IdleMonitor → org.freedesktop.ScreenSaver；
               音频播放（pactl sink-inputs）或前台全屏期间豁免 AFK
  音乐信息   — MPRIS D-Bus（Linux 标准媒体协议）：playerctl 优先，gdbus 兜底
  配置       — config.json 读写校验（server_url 仅允许 HTTPS 或内网 HTTP）
  设置窗口   — tkinter；子进程方式打开（--settings-dialog 入口），
               避免与托盘 GTK 主循环在同一进程互踩
  Reporter   — 指数退避 + 连续失败熔断暂停（非阻塞），ISO-8601 UTC 时间戳
  托盘       — pystray（绿/橙/灰）；Wayland 下 AppIndicator 可能不可用，
               config 里 enable_tray=false 可跳过托盘无头运行
  自启动     — XDG autostart（~/.config/autostart/*.desktop），托盘菜单开关
  监控循环   — 变化即报 + 定期心跳

联动关系：
  - 上报格式与后端 packages/backend/src/routes/report.ts 对齐
    （window_title 只用于服务端生成 display_title，原文不落库）
  - 隐私分级、应用名映射全部在服务端完成，本 agent 不做任何映射；
    app_id 上报原始标识（X11 WM_CLASS / Wayland app_id），
    服务端 app-names.json linux 节负责翻译
  - 配置示例见同目录 config.example.json；部署说明见 README.md

依赖:
  pip install psutil requests pystray Pillow
  系统工具（按需，缺了对应功能自动降级）:
    xprop xprintidle  — X11 窗口/空闲（一般随 x11-utils 已装）
    playerctl         — 音乐识别增强（无它则走 gdbus 解析 MPRIS）
    pactl             — 音频播放豁免（PulseAudio/PipeWire 自带）

已知限制:
  GNOME/KDE 的纯 Wayland 会话不向第三方暴露前台窗口信息（安全设计），
  此时只能识别 XWayland 应用；原生 Wayland 应用在前台时报 heartbeat。
  Sway / Hyprland / X11 会话完整支持。
"""

from datetime import datetime, timezone
import ipaddress
import json
import logging
import logging.handlers
import os
import re
import shlex
import shutil
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
# 日志：始终输出控制台，文件日志可按配置开关（按天轮转，保留 2 天）
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
    """按配置开关文件日志，并按天轮转保留 2 天。"""
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


def _run(cmd: list[str], timeout: float = 5) -> str | None:
    """子进程调用统一入口：成功返回 stdout，失败/超时返回 None。"""
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        if result.returncode != 0:
            return None
        return result.stdout
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        return None


# ---------------------------------------------------------------------------
# 会话探测：启动时确定窗口检测通道，之后每轮直接用（会话类型不会中途变）
# ---------------------------------------------------------------------------
def detect_window_backend() -> str:
    """返回 'sway' | 'hyprland' | 'x11' | 'none'。

    Wayland 合成器优先探测专用 IPC（swaymsg/hyprctl 都有真实调用验证），
    再退 X11/XWayland 的 xprop。纯 Wayland 的 GNOME/KDE 两者都不可用时，
    xprop 仍能看到 XWayland 窗口，所以只要 DISPLAY 存在就保留 x11 通道。
    """
    if os.environ.get("SWAYSOCK") and _run(["swaymsg", "-t", "get_version"], 3):
        return "sway"
    if os.environ.get("HYPRLAND_INSTANCE_SIGNATURE") and _run(["hyprctl", "version"], 3):
        return "hyprland"
    if os.environ.get("DISPLAY") and shutil.which("xprop"):
        # 验证 X 服务真的可连（Wayland 无 XWayland 时 DISPLAY 可能是死的）
        if _run(["xprop", "-root", "_NET_ACTIVE_WINDOW"], 3) is not None:
            return "x11"
    return "none"


# ---------------------------------------------------------------------------
# 窗口信息：三通道分层读取前台应用与窗口标题
# ---------------------------------------------------------------------------
def _sway_focused_node(node: dict) -> dict | None:
    """深度优先找 focused=true 的叶子节点。"""
    if node.get("focused"):
        return node
    for child in node.get("nodes", []) + node.get("floating_nodes", []):
        found = _sway_focused_node(child)
        if found:
            return found
    return None


def _get_foreground_sway() -> tuple[str, str, bool] | None:
    output = _run(["swaymsg", "-t", "get_tree"])
    if not output:
        return None
    try:
        node = _sway_focused_node(json.loads(output))
    except json.JSONDecodeError:
        return None
    if not node:
        return None
    # 原生 Wayland 窗口有 app_id；XWayland 窗口用 window_properties.class
    app_id = node.get("app_id") or (node.get("window_properties") or {}).get("class")
    if not app_id:
        return None
    title = node.get("name") or ""
    fullscreen = bool(node.get("fullscreen_mode"))
    return str(app_id), str(title), fullscreen


def _get_foreground_hyprland() -> tuple[str, str, bool] | None:
    output = _run(["hyprctl", "activewindow", "-j"])
    if not output:
        return None
    try:
        win = json.loads(output)
    except json.JSONDecodeError:
        return None
    app_id = win.get("class") or win.get("initialClass")
    if not app_id:
        return None
    title = win.get("title") or ""
    # fullscreen 字段在 v0.42 前是 bool，之后是 int 模式枚举，truthy 判断两者通吃
    fullscreen = bool(win.get("fullscreen"))
    return str(app_id), str(title), fullscreen


def _get_foreground_x11() -> tuple[str, str, bool] | None:
    output = _run(["xprop", "-root", "_NET_ACTIVE_WINDOW"])
    if not output:
        return None
    match = re.search(r"window id # (0x[0-9a-fA-F]+)", output)
    if not match or match.group(1) == "0x0":
        return None
    win_id = match.group(1)
    detail = _run(["xprop", "-id", win_id, "WM_CLASS", "_NET_WM_NAME", "WM_NAME", "_NET_WM_STATE"])
    if not detail:
        return None

    app_id = ""
    # WM_CLASS(STRING) = "Navigator", "firefox" — 第二段是 res_class，作应用标识
    cls = re.search(r'WM_CLASS\(STRING\) = "(?:[^"]*)", "([^"]*)"', detail)
    if cls:
        app_id = cls.group(1)
    if not app_id:
        return None

    title = ""
    name = re.search(r'_NET_WM_NAME\(UTF8_STRING\) = "((?:[^"\\]|\\.)*)"', detail)
    if not name:
        name = re.search(r'WM_NAME\((?:STRING|COMPOUND_TEXT)\) = "((?:[^"\\]|\\.)*)"', detail)
    if name:
        # xprop 对非 ASCII 输出 \xxx 转义，尽力还原
        raw = name.group(1)
        try:
            title = raw.encode("latin-1", "ignore").decode("unicode_escape") \
                if "\\" in raw else raw
        except Exception:
            title = raw

    fullscreen = "_NET_WM_STATE_FULLSCREEN" in detail
    return app_id, title, fullscreen


_WINDOW_GETTERS = {
    "sway": _get_foreground_sway,
    "hyprland": _get_foreground_hyprland,
    "x11": _get_foreground_x11,
}


def get_foreground_info(backend: str) -> tuple[str, str, bool] | None:
    """返回 (应用标识, 窗口标题, 是否全屏)，无可用通道/读取失败返回 None。"""
    getter = _WINDOW_GETTERS.get(backend)
    if getter is None:
        return None
    return getter()


# ---------------------------------------------------------------------------
# 空闲检测：依序尝试多个来源，全部失败返回 0（保守：永不误判 AFK）
# ---------------------------------------------------------------------------
def _idle_xprintidle() -> float | None:
    output = _run(["xprintidle"], 3)
    if output is None:
        return None
    try:
        return int(output.strip()) / 1000
    except ValueError:
        return None


def _idle_mutter() -> float | None:
    """GNOME（X11 与 Wayland 都可用）：Mutter IdleMonitor，返回毫秒。"""
    output = _run([
        "gdbus", "call", "--session",
        "--dest", "org.gnome.Mutter.IdleMonitor",
        "--object-path", "/org/gnome/Mutter/IdleMonitor/Core",
        "--method", "org.gnome.Mutter.IdleMonitor.GetIdletime",
    ], 3)
    if output is None:
        return None
    match = re.search(r"uint64 (\d+)", output)
    return int(match.group(1)) / 1000 if match else None


def _idle_screensaver() -> float | None:
    """KDE 等实现了 org.freedesktop.ScreenSaver 的桌面，返回秒。"""
    output = _run([
        "gdbus", "call", "--session",
        "--dest", "org.freedesktop.ScreenSaver",
        "--object-path", "/org/freedesktop/ScreenSaver",
        "--method", "org.freedesktop.ScreenSaver.GetSessionIdleTime",
    ], 3)
    if output is None:
        return None
    match = re.search(r"uint32 (\d+)", output)
    return float(match.group(1)) if match else None


_idle_sources: list = []


def detect_idle_sources(backend: str) -> None:
    """启动时探测可用的空闲时间来源并缓存（探测即真实调用）。"""
    candidates = []
    if backend == "x11" and shutil.which("xprintidle"):
        candidates.append(_idle_xprintidle)
    candidates += [_idle_mutter, _idle_screensaver]
    for fn in candidates:
        if fn() is not None:
            _idle_sources.append(fn)
    if not _idle_sources:
        log.warning("No idle-time source available; AFK detection disabled")


def get_idle_seconds() -> float:
    for fn in _idle_sources:
        val = fn()
        if val is not None:
            return val
    return 0.0


# ---------------------------------------------------------------------------
# 音频播放检测：pactl（PulseAudio / PipeWire 通用）
# ---------------------------------------------------------------------------
def is_audio_playing() -> bool:
    """存在未暂停（Corked: no）的音频流即视为在播。"""
    output = _run(["pactl", "list", "sink-inputs"], 3)
    if not output:
        return False
    return bool(re.search(r"Corked:\s*no", output))


# ---------------------------------------------------------------------------
# 音乐信息：MPRIS D-Bus。playerctl 优先（专用工具），gdbus 手动解析兜底
# ---------------------------------------------------------------------------
def _music_playerctl() -> dict | None:
    players = _run(["playerctl", "-l"], 3)
    if not players:
        return None
    for player in players.strip().splitlines():
        player = player.strip()
        if not player:
            continue
        status = _run(["playerctl", "-p", player, "status"], 3)
        if not status or status.strip() != "Playing":
            continue
        meta = _run([
            "playerctl", "-p", player, "metadata",
            "--format", "{{title}}|SEP|{{artist}}",
        ], 3)
        if not meta:
            continue
        title, _, artist = meta.strip().partition("|SEP|")
        if not title:
            continue
        info: dict[str, str] = {"app": player.split(".")[0][:64]}
        info["title"] = title.strip()[:256]
        if artist.strip():
            info["artist"] = artist.strip()[:256]
        return info
    return None


def _gdbus_get(dest: str, iface_prop: tuple[str, str]) -> str | None:
    return _run([
        "gdbus", "call", "--session", "--dest", dest,
        "--object-path", "/org/mpris/MediaPlayer2",
        "--method", "org.freedesktop.DBus.Properties.Get",
        iface_prop[0], iface_prop[1],
    ], 3)


def _music_gdbus() -> dict | None:
    names = _run([
        "gdbus", "call", "--session",
        "--dest", "org.freedesktop.DBus",
        "--object-path", "/org/freedesktop/DBus",
        "--method", "org.freedesktop.DBus.ListNames",
    ], 5)
    if not names:
        return None
    for service in re.findall(r"'(org\.mpris\.MediaPlayer2\.[^']+)'", names):
        status = _gdbus_get(service, ("org.mpris.MediaPlayer2.Player", "PlaybackStatus"))
        if not status or "'Playing'" not in status:
            continue
        meta = _gdbus_get(service, ("org.mpris.MediaPlayer2.Player", "Metadata"))
        if not meta:
            continue
        title_m = re.search(r"'xesam:title': <'((?:[^'\\]|\\.)*)'>", meta)
        artist_m = re.search(r"'xesam:artist': <\['((?:[^'\\]|\\.)*)'", meta)
        if not title_m or not title_m.group(1):
            continue
        info: dict[str, str] = {
            "app": service.removeprefix("org.mpris.MediaPlayer2.").split(".")[0][:64],
            "title": title_m.group(1)[:256],
        }
        if artist_m and artist_m.group(1):
            info["artist"] = artist_m.group(1)[:256]
        return info
    return None


_HAS_PLAYERCTL = bool(shutil.which("playerctl"))


def get_music_info() -> dict | None:
    if _HAS_PLAYERCTL:
        info = _music_playerctl()
        if info:
            return info
    return _music_gdbus()


# ---------------------------------------------------------------------------
# 电池信息
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
# 配置
# ---------------------------------------------------------------------------
CONFIG_PATH = base_dir / "config.json"

_DEFAULT_CFG = {
    "server_url": "",
    "token": "",
    "interval_seconds": 5,
    "heartbeat_seconds": 60,
    "idle_threshold_seconds": 300,
    "enable_log": False,
    # Wayland 部分环境（无 AppIndicator 扩展的 GNOME 等）托盘不可用，
    # 初始化失败会自动降级为无托盘；设 false 可直接跳过。
    "enable_tray": True,
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
# 设置窗口
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

    ttk.Label(frame, text="离开判定 (秒):").grid(row=4, column=0, sticky="w", pady=6)
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
            "enable_tray": cfg.get("enable_tray", True),
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
    """设置 UI 走独立进程，避免 pystray(GTK) 与 Tk 主循环在同一进程互踩。

    子进程方案与 --settings-dialog 入口沿用 macOS agent 的实现
    （最初来自 @Steve5wutongyu6 的 PR #35，特此致谢）。
    """
    cmd: list[str] = []
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
# 自启动：XDG autostart（图形会话登录时拉起，与 agent 需要桌面环境的前提一致）
# ---------------------------------------------------------------------------
AUTOSTART_DIR = Path.home() / ".config" / "autostart"
AUTOSTART_FILE = AUTOSTART_DIR / "live-dashboard-agent.desktop"


def _autostart_exec() -> str:
    if getattr(sys, "frozen", False):
        return shlex.quote(str(Path(sys.executable).resolve()))
    return f"{shlex.quote(sys.executable)} {shlex.quote(str(Path(__file__).resolve()))}"


def is_autostart_enabled() -> bool:
    return AUTOSTART_FILE.exists()


def set_autostart(enabled: bool) -> bool:
    try:
        if enabled:
            AUTOSTART_DIR.mkdir(parents=True, exist_ok=True)
            AUTOSTART_FILE.write_text(
                "[Desktop Entry]\n"
                "Type=Application\n"
                "Name=Live Dashboard Agent\n"
                f"Exec={_autostart_exec()}\n"
                "X-GNOME-Autostart-enabled=true\n"
                "Comment=Report device activity to Live Dashboard\n",
                encoding="utf-8",
            )
        else:
            AUTOSTART_FILE.unlink(missing_ok=True)
        return True
    except Exception as e:
        log.error("Autostart update failed: %s", e)
        return False


# ---------------------------------------------------------------------------
# 上报器
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
        self._pause_until = 0.0

    def send(self, app_id: str, window_title: str, extra: dict | None = None) -> bool:
        if self.pause_remaining > 0:
            return False

        payload = {
            "app_id": app_id,
            "window_title": window_title[:256],
            "timestamp": (
                datetime.now(timezone.utc)
                .isoformat(timespec="milliseconds")
                .replace("+00:00", "Z")
            ),
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
        self._current_backoff = (
            5 if self._current_backoff == 0
            else min(self._current_backoff * 2, self.MAX_BACKOFF)
        )
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
# 系统托盘
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
    """带中文菜单、悬浮提示和设置入口的系统托盘。"""

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
            p.MenuItem("开机自启", self._toggle_autostart,
                       checked=lambda _: is_autostart_enabled()),
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

    def _toggle_autostart(self):
        set_autostart(not is_autostart_enabled())

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
        icon_path = base_dir / "icon.png"
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
# 监控循环
# ---------------------------------------------------------------------------
def _monitor_loop(cfg: dict, reporter: Reporter, tray: TrayAgent | None, backend: str) -> None:
    interval = cfg["interval_seconds"]
    heartbeat_interval = cfg["heartbeat_seconds"]
    idle_threshold = cfg["idle_threshold_seconds"]

    prev_app: str | None = None
    prev_title: str | None = None
    last_report_time: float = 0
    was_idle = False

    log.info(
        "Monitoring — backend=%s, interval=%ds, heartbeat=%ds, idle=%ds",
        backend, interval, heartbeat_interval, idle_threshold,
    )
    if tray:
        tray.update_status("在线")

    while not shutdown_event.is_set():
        try:
            now = time.time()

            info = get_foreground_info(backend)
            fullscreen = info[2] if info else False

            idle_secs = get_idle_seconds()
            is_idle = (idle_secs >= idle_threshold
                       and not is_audio_playing()
                       and not fullscreen)

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
                    elif reporter.retry_delay > 0:
                        shutdown_event.wait(reporter.retry_delay)
                        continue
                shutdown_event.wait(interval)
                continue

            if info is None:
                # 窗口通道不可用（纯 Wayland GNOME/KDE 的原生窗口等）：
                # 退化为纯心跳模式，至少让面板知道设备在线、电池多少
                heartbeat_due = (now - last_report_time) >= heartbeat_interval
                if heartbeat_due:
                    extra = get_battery_extra()
                    music = get_music_info()
                    if music:
                        extra["music"] = music
                    if reporter.send("linux-desktop", "", extra):
                        last_report_time = now
                    elif reporter.retry_delay > 0:
                        shutdown_event.wait(reporter.retry_delay)
                        continue
                shutdown_event.wait(interval)
                continue

            app_id, title, _ = info

            # 托盘提示每轮都刷新，让当前状态反馈更及时。
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
                elif reporter.retry_delay > 0:
                    shutdown_event.wait(reporter.retry_delay)
                    continue

            shutdown_event.wait(interval)

        except Exception as e:
            log.error("Error: %s", e, exc_info=True)
            shutdown_event.wait(interval)

    log.info("Monitor stopped")


# ---------------------------------------------------------------------------
# 主入口
# ---------------------------------------------------------------------------
def main() -> None:
    log.info("Live Dashboard Linux Agent")

    if "--settings-dialog" in sys.argv:
        cfg = load_config()
        new_cfg = show_settings_dialog(cfg)
        raise SystemExit(0 if new_cfg is not None else 1)

    backend = detect_window_backend()
    if backend == "none":
        log.warning(
            "No usable window backend (Sway/Hyprland IPC and X11/XWayland all "
            "unavailable) — running in heartbeat-only mode. "
            "GNOME/KDE native Wayland windows cannot be read by third-party apps."
        )
    detect_idle_sources(backend)

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
        if not cfg.get("enable_tray", True):
            log.info("enable_tray=false，以无托盘模式运行")
        else:
            try:
                tray = TrayAgent()
            except ImportError:
                log.warning("pystray/Pillow not installed, running without tray")
            except Exception as e:
                log.warning("Tray init failed: %s", e)

        if tray:
            monitor = threading.Thread(
                target=_monitor_loop, args=(cfg, reporter, tray, backend), daemon=True
            )
            monitor.start()
            try:
                tray.run()
            except Exception as e:
                # Wayland 无 AppIndicator 等环境 pystray 运行期才报错：降级无托盘
                log.warning("Tray crashed (%s), falling back to headless mode", e)
                shutdown_event.set()
                monitor.join(timeout=5)
                shutdown_event.clear()
                try:
                    _monitor_loop(cfg, reporter, None, backend)
                except KeyboardInterrupt:
                    pass
                break
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
                _monitor_loop(cfg, reporter, None, backend)
            except KeyboardInterrupt:
                pass
            break

    log.info("Agent stopped")


if __name__ == "__main__":
    main()
