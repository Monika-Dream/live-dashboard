"""
Live Dashboard — macOS Agent
Monitors the foreground window and reports app usage to the dashboard backend.

Requirements:
  pip install psutil requests

Permissions:
  System Preferences → Privacy & Security → Accessibility → add Terminal (or your terminal app)
"""

import ipaddress
import json
import logging
import socket
import subprocess
import sys
import time
import urllib.parse
from pathlib import Path

import psutil
import requests

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
LOG_FILE = Path(__file__).with_name("agent.log")
logging.basicConfig(
    level=logging.DEBUG,  # Changed from INFO to DEBUG for music detection troubleshooting
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
log = logging.getLogger("agent")

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
    """Return (process_name, window_title) of the current foreground window, or None."""
    try:
        result = subprocess.run(
            ["osascript", "-e", _APPLESCRIPT],
            capture_output=True,
            text=True,
            timeout=5,
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
    except (subprocess.TimeoutExpired, Exception) as e:
        log.debug("get_foreground_info error: %s", e)
        return None


# ---------------------------------------------------------------------------
# Battery info
# ---------------------------------------------------------------------------
def get_battery_extra() -> dict:
    """Return battery info dict, or empty dict if no battery (desktop Mac)."""
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


def get_qqmusic_info() -> dict | None:
    """Read QQ Music metadata from the system media session via media-control."""
    try:
        result = subprocess.run(
            ["media-control", "get"],
            capture_output=True,
            text=True,
            timeout=3,
        )
    except (subprocess.TimeoutExpired, FileNotFoundError, Exception) as e:
        log.debug("QQ Music detection error via media-control: %s", e)
        return None

    if result.returncode != 0:
        log.debug("QQ Music detection error via media-control: exit %s", result.returncode)
        return None

    raw = result.stdout.strip()
    if not raw:
        return None

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        log.debug("QQ Music detection error via media-control: invalid JSON: %s", e)
        return None

    if data.get("bundleIdentifier") != "com.tencent.QQMusicMac":
        return None

    info: dict[str, object] = {
        "app": "QQ音乐",
        "bundleIdentifier": data.get("bundleIdentifier"),
    }
    if isinstance(data.get("title"), str) and data["title"].strip():
        info["title"] = data["title"].strip()[:256]
    if isinstance(data.get("artist"), str) and data["artist"].strip():
        info["artist"] = data["artist"].strip()[:256]
    if isinstance(data.get("album"), str) and data["album"].strip():
        info["album"] = data["album"].strip()[:256]
    if isinstance(data.get("playing"), bool):
        info["playing"] = data["playing"]
    if isinstance(data.get("duration"), (int, float)):
        info["duration"] = data["duration"]
    if isinstance(data.get("elapsedTime"), (int, float)):
        info["elapsedTime"] = data["elapsedTime"]

    if "title" not in info:
        return None

    return info


def get_music_info() -> dict | None:
    """Query known music apps via AppleScript to find now-playing info."""
    qqmusic = get_qqmusic_info()
    if qqmusic:
        log.debug("Found music from QQ Music media session: %s", qqmusic)
        return qqmusic

    for app_name, script in _MUSIC_APPS.items():
        try:
            result = subprocess.run(
                ["osascript", "-e", script],
                capture_output=True, text=True, timeout=3,
            )
            if result.returncode != 0:
                log.debug(f"Music detection error for {app_name}: AppleScript returned {result.returncode}")
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
                # Window-title-only apps (QQ音乐, 网易云)
                if " - " in output:
                    song, artist = output.split(" - ", 1)
                    info["title"] = song.strip()[:256]
                    info["artist"] = artist.strip()[:256]
                else:
                    info["title"] = output[:256]
            
            log.debug(f"Found music from {app_name}: {info}")
            return info
        except (subprocess.TimeoutExpired, Exception) as e:
            log.debug(f"Music detection error for {app_name}: {e}")
            continue
    return None


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
        log.error("Cannot resolve hostname: %s", e)
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
    config_path = Path(__file__).with_name("config.json")
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

    required = ("server_url", "token")
    for key in required:
        if not cfg.get(key) or cfg[key] == "YOUR_TOKEN_HERE":
            log.error("config.json: '%s' is not set", key)
            sys.exit(1)

    validate_server_url(cfg["server_url"])

    for key, default, lo, hi in [
        ("interval_seconds", 5, 1, 300),
        ("heartbeat_seconds", 60, 10, 600),
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

    def send(self, app_id: str, window_title: str, extra: dict | None = None, music: dict | None = None) -> bool:
        """Send a report. Returns True on success."""
        payload = {
            "app_id": app_id,
            "window_title": window_title[:256],
            "timestamp": int(time.time() * 1000),
        }
        if extra or music:
            payload["extra"] = extra or {}
            if music:
                payload["extra"]["music"] = music
        try:
            resp = self.session.post(self.endpoint, json=payload, timeout=10)
            if resp.status_code in (200, 201, 409):
                self._consecutive_failures = 0
                self._current_backoff = 0
                return True
            log.warning("Server returned %d: %s", resp.status_code, resp.text[:200])
        except requests.RequestException as e:
            log.warning("Request failed: %s", e)

        self._consecutive_failures += 1
        self._current_backoff = (
            5 if self._current_backoff == 0
            else min(self._current_backoff * 2, self.MAX_BACKOFF)
        )

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
    log.info("Starting Live Dashboard macOS Agent")
    cfg = load_config()
    reporter = Reporter(cfg["server_url"], cfg["token"])

    interval = cfg["interval_seconds"]
    heartbeat_interval = cfg["heartbeat_seconds"]

    prev_app: str | None = None
    prev_title: str | None = None
    last_report_time: float = 0

    log.info(
        "Monitoring started — interval=%ds, heartbeat=%ds, server=%s",
        interval,
        heartbeat_interval,
        cfg["server_url"],
    )

    while True:
        try:
            info = get_foreground_info()
            now = time.time()

            if info is None:
                time.sleep(interval)
                continue

            app_id, title = info
            changed = app_id != prev_app or title != prev_title
            heartbeat_due = (now - last_report_time) >= heartbeat_interval

            if changed or heartbeat_due:
                extra = get_battery_extra()
                music = get_music_info()
                success = reporter.send(app_id, title, extra, music)
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
