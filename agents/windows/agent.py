"""
Live Dashboard — Windows Agent
Monitors the foreground window and reports app usage to the dashboard backend.
"""

import ctypes
import ctypes.wintypes
import json
import logging
import os
import sys
import time
from pathlib import Path

import psutil
import requests

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
LOG_FILE = Path(__file__).with_name("agent.log")
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

    # Validate required fields
    required = ("server_url", "token")
    for key in required:
        if not cfg.get(key) or cfg[key] == "YOUR_TOKEN_HERE":
            log.error("config.json: '%s' is not set", key)
            sys.exit(1)

    url: str = cfg["server_url"]
    if not url.startswith("http://") and not url.startswith("https://"):
        log.error("config.json: 'server_url' must start with http:// or https:// (got %s)", url)
        sys.exit(1)

    # Validate numeric fields with sane defaults
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
                # No foreground window (lock screen, desktop, etc.)
                time.sleep(interval)
                continue

            app_id, title = info
            changed = app_id != prev_app or title != prev_title
            heartbeat_due = (now - last_report_time) >= heartbeat_interval

            if changed or heartbeat_due:
                extra = get_battery_extra()
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
