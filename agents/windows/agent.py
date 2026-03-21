"""
Live Dashboard — Windows Agent
Monitors the foreground window and reports app usage to the dashboard backend.
"""

import ctypes
import ctypes.wintypes
import ipaddress
import json
import logging
import os
import socket
import sys
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
# Logging
# ---------------------------------------------------------------------------
LOG_FILE = base_dir / "agent.log"
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
log = logging.getLogger("agent")

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
        return 0.0  # API failed, assume active
    now = GetTickCount()
    # Handle 32-bit tick count wraparound (~49 days)
    elapsed_ms = (now - lii.dwTime) & 0xFFFFFFFF
    return elapsed_ms / 1000.0


def get_foreground_info() -> tuple[str, str] | None:
    """Return (process_name, window_title) of the current foreground window,
    or None if no window / error."""
    hwnd = GetForegroundWindow()
    if not hwnd:
        return None

    # Window title
    length = GetWindowTextLengthW(hwnd)
    if length <= 0:
        return None
    buf = ctypes.create_unicode_buffer(length + 1)
    GetWindowTextW(hwnd, buf, length + 1)
    title = buf.value.strip()
    if not title:
        return None

    # Process name
    pid = ctypes.wintypes.DWORD()
    GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    try:
        proc = psutil.Process(pid.value)
        proc_name = proc.name()  # e.g. "chrome.exe"
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        proc_name = "unknown"

    return proc_name, title


# ---------------------------------------------------------------------------
# Music detection — scan ALL windows (not just foreground)
# ---------------------------------------------------------------------------
# EnumWindows callback type
WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.wintypes.BOOL, ctypes.wintypes.HWND, ctypes.wintypes.LPARAM)

EnumWindows = user32.EnumWindows
EnumWindows.argtypes = [WNDENUMPROC, ctypes.wintypes.LPARAM]
EnumWindows.restype = ctypes.wintypes.BOOL

IsWindowVisible = user32.IsWindowVisible
IsWindowVisible.argtypes = [ctypes.wintypes.HWND]
IsWindowVisible.restype = ctypes.wintypes.BOOL

# Known music apps: maps process-name-lowercase → app display name
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

# Title parsers: extract (title, artist) from window title for each app
def _parse_spotify_title(title: str) -> tuple[str, str] | None:
    """Spotify: 'Artist - Song' when playing, 'Spotify Free/Premium' when idle."""
    if title in ("Spotify", "Spotify Free", "Spotify Premium"):
        return None  # not playing
    if " - " in title:
        artist, song = title.split(" - ", 1)
        return song.strip(), artist.strip()
    return title, ""

def _parse_dash_title(title: str, app_suffix: str = "") -> tuple[str, str] | None:
    """Generic 'Song - Artist' parser (QQ音乐, 网易云, etc.)."""
    if app_suffix and title.rstrip() == app_suffix:
        return None  # idle
    if " - " in title:
        song, artist = title.split(" - ", 1)
        return song.strip(), artist.strip()
    return title, ""

def _parse_foobar_title(title: str) -> tuple[str, str] | None:
    """foobar2000: configurable, common format '[Artist - Song [foobar2000]]'."""
    # Strip trailing " [foobar2000]" or " [foobar2000 ...]"
    import re
    cleaned = re.sub(r"\s*\[foobar2000[^\]]*\]\s*$", "", title)
    if not cleaned or cleaned == title:
        # No foobar suffix found, or empty after stripping
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
    results: list[tuple[str, str, str]] = []  # (app, title, artist)

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
        elif proc_lower in ("qqmusic.exe", "cloudmusic.exe", "kugou.exe", "kwmusic.exe"):
            parsed = _parse_dash_title(win_title)
        else:
            parsed = _parse_dash_title(win_title)

        if parsed:
            song, artist = parsed
            results.append((app_name, song, artist))
        return True

    try:
        EnumWindows(WNDENUMPROC(enum_callback), 0)
    except Exception as e:
        log.debug("EnumWindows error: %s", e)
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
    """Return battery info dict, or empty dict if no battery (desktop PC)."""
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
# URL security validation
# ---------------------------------------------------------------------------
def validate_server_url(url: str) -> None:
    """Validate server_url security: HTTPS always allowed, HTTP only for private networks."""
    parsed = urllib.parse.urlparse(url)
    scheme = parsed.scheme.lower()
    hostname = parsed.hostname

    if scheme not in ("http", "https"):
        log.error("server_url must use http:// or https://")
        sys.exit(1)

    if not hostname:
        log.error("server_url has no valid hostname")
        sys.exit(1)

    # HTTPS is always safe (token encrypted in transit)
    if scheme == "https":
        return

    # HTTP — resolve hostname and check ALL IPs are private
    try:
        addrinfos = socket.getaddrinfo(hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
    except socket.gaierror as e:
        log.error("Cannot resolve hostname '%s': %s", hostname, e)
        sys.exit(1)

    ips = {info[4][0] for info in addrinfos}
    for ip_str in ips:
        ip = ipaddress.ip_address(ip_str)
        if ip.is_global:
            log.error(
                "HTTP refused: hostname resolves to public IP. Use HTTPS for public servers.",
            )
            sys.exit(1)

    log.warning(
        "HTTP allowed for private network (%s). Token sent in plaintext!",
        hostname,
    )


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
def load_config() -> dict:
    """Load config.json from the same directory as this script."""
    config_path = base_dir / "config.json"
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            cfg = json.load(f)
    except FileNotFoundError:
        log.error("config.json not found at %s", config_path)
        sys.exit(1)
    except PermissionError:
        log.error("config.json: permission denied — %s", config_path)
        sys.exit(1)
    except json.JSONDecodeError as e:
        log.error("config.json: invalid JSON — %s", e)
        sys.exit(1)

    if not isinstance(cfg, dict):
        log.error("config.json: expected a JSON object, got %s", type(cfg).__name__)
        sys.exit(1)

    # Validate required fields
    required = ("server_url", "token")
    for key in required:
        if not cfg.get(key) or cfg[key] == "YOUR_TOKEN_HERE":
            log.error("config.json: '%s' is not set", key)
            sys.exit(1)

    validate_server_url(cfg["server_url"])

    # Validate numeric fields with sane defaults
    for key, default, lo, hi in [
        ("interval_seconds", 5, 1, 300),
        ("heartbeat_seconds", 60, 10, 600),
        ("idle_threshold_seconds", 300, 30, 3600),
    ]:
        val = cfg.get(key, default)
        if not isinstance(val, (int, float)) or val < lo or val > hi:
            log.warning("config.json: '%s' invalid (%r), using %d", key, val, default)
            val = default
        cfg[key] = int(val)

    return cfg


# ---------------------------------------------------------------------------
# Reporter
# ---------------------------------------------------------------------------
class Reporter:
    """Handles sending reports to the backend with exponential backoff."""

    MAX_BACKOFF = 60  # seconds
    PAUSE_AFTER_FAILURES = 5  # consecutive failures before long pause
    PAUSE_DURATION = 300  # 5 minutes

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

    def send(self, app_id: str, window_title: str, extra: dict | None = None) -> bool:
        """Send a report. Returns True on success."""
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
                # 409 = duplicate, still counts as success
                self._consecutive_failures = 0
                self._current_backoff = 0
                return True
            log.warning("Server returned %d: %s", resp.status_code, resp.text[:200])
        except requests.RequestException as e:
            log.warning("Request failed: %s", e)

        self._consecutive_failures += 1
        if self._current_backoff == 0:
            self._current_backoff = 5
        else:
            self._current_backoff = min(self._current_backoff * 2, self.MAX_BACKOFF)

        if self._consecutive_failures >= self.PAUSE_AFTER_FAILURES:
            log.warning(
                "Failed %d times in a row, pausing %ds",
                self._consecutive_failures,
                self.PAUSE_DURATION,
            )
            time.sleep(self.PAUSE_DURATION)
            self._consecutive_failures = 0
            self._current_backoff = 0
        return False

    @property
    def backoff(self) -> float:
        return self._current_backoff


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------
def main() -> None:
    log.info("Starting Live Dashboard Windows Agent")
    cfg = load_config()
    reporter = Reporter(cfg["server_url"], cfg["token"])

    interval = cfg["interval_seconds"]
    heartbeat_interval = cfg["heartbeat_seconds"]
    idle_threshold = cfg["idle_threshold_seconds"]

    prev_app: str | None = None
    prev_title: str | None = None
    last_report_time: float = 0
    was_idle = False

    log.info(
        "Monitoring started — interval=%ds, heartbeat=%ds, idle=%ds, server=%s",
        interval,
        heartbeat_interval,
        idle_threshold,
        cfg["server_url"],
    )

    while True:
        try:
            now = time.time()

            # AFK detection: if no input for idle_threshold, only send heartbeats
            idle_secs = get_idle_seconds()
            is_idle = idle_secs >= idle_threshold

            if is_idle and not was_idle:
                log.info("User idle (%.0fs), switching to heartbeat-only", idle_secs)
                was_idle = True
            elif not is_idle and was_idle:
                log.info("User returned after idle")
                was_idle = False

            if is_idle:
                # Still send heartbeats so server knows agent is alive
                heartbeat_due = (now - last_report_time) >= heartbeat_interval
                if heartbeat_due:
                    extra = get_battery_extra()
                    if reporter.send("idle", "User is away", extra):
                        last_report_time = now
                time.sleep(interval)
                continue

            info = get_foreground_info()

            if info is None:
                # No foreground window (lock screen, desktop, etc.)
                time.sleep(interval)
                continue

            app_id, title = info
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
                    time.sleep(reporter.backoff)
                    continue

            time.sleep(interval)

        except KeyboardInterrupt:
            log.info("Shutting down")
            break
        except Exception as e:
            log.error("Unexpected error: %s", e, exc_info=True)
            time.sleep(interval)


if __name__ == "__main__":
    main()
