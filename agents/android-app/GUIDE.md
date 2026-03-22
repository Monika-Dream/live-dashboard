# Live Dashboard Android App — Code Guide

> Auto-generated reference for Lyra. Updated: 2026-03-22

## Build & Deploy

- **Min SDK**: check `app/build.gradle.kts` → `minSdk`
- **Build**: `./gradlew assembleDebug` (from `agents/android-app/`)
- **APK output**: `app/build/outputs/apk/debug/app-debug.apk`
- **Install**: `adb install -r app/build/outputs/apk/debug/app-debug.apk`

## Architecture Overview

```
MainActivity (Compose UI, 3 tabs)
  ├─ SetupScreen     → server config + heartbeat toggle (starts/stops HeartbeatWorker)
  ├─ HealthScreen    → Health Connect permissions & sync config
  └─ StatusScreen    → permission status + debug log

Workers (WorkManager, survive process freeze):
  ├─ HeartbeatWorker    → optional periodic battery + online status heartbeat
  └─ HealthSyncWorker   → periodic Health Connect data sync

Data:
  ├─ SettingsStore   → DataStore (prefs) + EncryptedSharedPreferences (token)
  ├─ ReportClient    → OkHttp3 HTTP client for API calls
  └─ DebugLog        → in-memory circular log (100 entries)
```

## Design Decisions

- **No AccessibilityService / foreground app detection**: Android does not provide a reliable way to detect the current foreground app without root or accessibility service. Xiaomi/HyperOS aggressively freezes accessibility services via cgroup v2 freezer, making it unusable. PC-side already reports foreground apps reliably.
- **No MusicListenerService**: Removed in v2. NotificationListenerService for music detection was removed to simplify the app. The app now focuses on Health Connect data upload with optional heartbeat.
- **WorkManager only**: HeartbeatWorker uses self-rescheduling OneTimeWorkRequest to bypass the 15-min periodic minimum. AlarmManager under the hood wakes the app even when frozen.
- **Heartbeat is optional**: Disabled by default. Users who want to show phone online status + battery can enable it in SetupScreen.

## File Map

| File | Role | When to touch |
|------|------|---------------|
| `MainActivity.kt` | Entry point, Scaffold + TopAppBar (connection status), tab navigation | UI layout changes, connection indicator |
| `ui/screens/SetupScreen.kt` | Server URL/token/interval config, save button, heartbeat toggle | Config UI, heartbeat start/stop |
| `ui/screens/HealthScreen.kt` | Health Connect permissions, type toggles, sync interval | Health data config |
| `ui/screens/StatusScreen.kt` | Permission status cards, background keep-alive checks, debug log | Status display |
| `ui/theme/Theme.kt` | Material 3 theme, colors (`Primary`, `Border`, etc.) | Color/style changes |
| `data/SettingsStore.kt` | All persistent settings (DataStore + encrypted token) | Adding new settings |
| `data/DebugLog.kt` | Thread-safe circular log buffer (ConcurrentLinkedDeque, max 100) | Logging changes |
| `network/ReportClient.kt` | HTTP client: `reportApp()`, `reportHealthData()`, `testConnection()` | API changes, new endpoints |
| `service/HeartbeatWorker.kt` | WorkManager worker: battery heartbeat, self-rescheduling (optional) | Reporting logic |
| `health/HealthConnectManager.kt` | Reads 17 health data types from Google Health Connect API | Adding health types |
| `health/HealthSyncWorker.kt` | WorkManager periodic worker for health sync (15-60 min) | Sync schedule, retry logic |
| `health/HealthDataTypes.kt` | Health type metadata (labels, units, icons) | Health type display |
| `DashboardApp.kt` | Application class, WorkManager config | App-level init |
| `PermissionRationaleActivity.kt` | Health Connect permission rationale page | Permission flow |
| `AndroidManifest.xml` | Permissions, service declarations, queries | New services/permissions |

## Key Flows

### Heartbeat Flow (Optional)
1. User clicks "开始监听" in SetupScreen → `HeartbeatWorker.schedule(context, interval)`
2. HeartbeatWorker fires after delay → reads battery info
3. `ReportClient.reportApp()` POSTs to `/api/report` with `appId="android"`, battery
4. Worker self-reschedules next OneTimeWorkRequest
5. Survives Xiaomi process freezer via AlarmManager

### Connection Status Flow
1. `MainActivity.DashboardTopBar()` runs `LaunchedEffect` loop
2. Every 5 seconds: creates temp `ReportClient`, calls `testConnection()` (GET `/api/health`)
3. Updates `connected` state → shows "已连接" (green) or "未连接" (gray) in TopAppBar

### Health Sync Flow
1. User grants Health Connect permissions in HealthScreen
2. User selects health types + sync interval
3. `HealthSyncWorker` runs periodically via WorkManager
4. Reads from Health Connect → POSTs to `/api/health-data`

## Common Issues & Fixes

| Symptom | Cause | Fix |
|---------|-------|-----|
| "未连接" but server is up | URL missing `https://` or token empty | Check SetupScreen config, ensure saved |
| Health sync not working | Health Connect not installed or permissions denied | Install Health Connect app, grant permissions in HealthScreen |
| Battery drain | Report interval too low (e.g. 10s) | Increase interval to 30-60s |
| Token save fails | EncryptedSharedPreferences unavailable (rare, old devices) | Warning shown in SetupScreen; no workaround |
| 后台被杀 | OEM 电池优化 | StatusScreen → 忽略电池优化 + 厂商特殊设置 |

## API Endpoints Used

| Method | Path | Purpose | Called by |
|--------|------|---------|-----------|
| POST | `/api/report` | Report heartbeat (battery + online status) | HeartbeatWorker |
| POST | `/api/health-data` | Upload health records | HealthSyncWorker |
| GET | `/api/health` | Connection test (health check) | MainActivity auto-test |

## Settings Keys (DataStore)

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `server_url` | String | `""` | Server base URL (HTTPS required) |
| `report_interval` | Int | `60` | Heartbeat interval in seconds (10-300) |
| `health_sync_interval` | Int | `15` | Health sync interval in minutes (15-60) |
| `enabled_health_types` | Set\<String\> | `emptySet()` | Which health types to sync |
| `monitoring_enabled` | Boolean | `false` | Whether heartbeat is active |
| `token` (encrypted) | String | `null` | Auth token (AES256-GCM) |
