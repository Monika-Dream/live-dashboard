# Live Dashboard Android App — 代码指南

> 更新：2026-03-28

## 构建与部署

- **最低 SDK**：见 `app/build.gradle.kts` → `minSdk` (26)
- **构建**：`./gradlew assembleDebug`（在 `agents/android-app/` 下执行）
- **APK 输出**：`app/build/outputs/apk/debug/app-debug.apk`
- **安装**：`adb install -r app/build/outputs/apk/debug/app-debug.apk`

## 设计决策

- **前台应用检测是 best effort**：Android 非 root 下无法像桌面端那样稳定拿到“此刻唯一真实的前台窗口”。当前实现基于 `UsageStatsManager`，能识别大多数常见切换，但仍可能受系统延迟、锁屏、厂商后台策略影响。
- **音乐监听依赖通知访问**：当前实现使用 `MediaSessionManager` + `NotificationListenerService`。不给权限时仍可继续心跳上报，只是不会附带歌曲信息。
- **仅 WorkManager**：HeartbeatWorker 使用自调度 OneTimeWorkRequest 绕过 15 分钟最小周期。底层 AlarmManager 即使被冻结也能唤醒。
- **心跳默认关闭**：不是所有用户都需要显示手机在线，作为可选功能。

## 关键流程

### 心跳流程（可选）
1. 用户在 SetupScreen 点击「开始监听」→ `HeartbeatWorker.schedule(context, interval)`
2. HeartbeatWorker 延迟触发 → 读取电量、屏幕交互状态
3. 若已授权「应用使用情况权限」，尝试通过 `CurrentAppDetector` 识别前台应用
4. 若已授权「通知访问」，尝试通过 `MusicMetadataProvider` 读取当前播放歌曲
5. `ReportClient.reportApp()` POST 到 `/api/report`，包含应用包名 + 电量 + 音乐信息
6. 如果屏幕熄灭或无法识别前台应用，会退回到 `idle` 或 `android`
4. Worker 自调度下一个 OneTimeWorkRequest
7. 通过 AlarmManager 存活于小米进程冻结

### 连接状态流程
1. `MainActivity.DashboardTopBar()` 运行 `LaunchedEffect` 循环
2. 每 5 秒创建临时 `ReportClient`，调用 `testConnection()`（GET `/api/health`）
3. 更新状态 → TopAppBar 显示「已连接」(绿) 或「未连接」(灰)

### 健康数据同步流程
1. 用户在 HealthScreen 授权 Health Connect 权限
2. 若设备开放 `FEATURE_READ_HEALTH_DATA_IN_BACKGROUND`（以设备与 Health Connect 的 feature 检测结果为准），再额外授权后台读取权限
3. 选择数据类型 + 同步间隔
4. `HealthSyncWorker` 通过 WorkManager 定时运行
5. 从 Health Connect 读取 → POST 到 `/api/health-data`

> 若设备不支持后台读取，APP 仍会在打开时自动执行前台同步；不会伪装成“后台已开启”。

## 常见问题

| 症状 | 原因 | 解决 |
|------|------|------|
| 「未连接」但服务器正常 | URL 缺少 `https://` 或 Token 为空 | 检查 SetupScreen 配置，确认已保存 |
| 健康同步不工作 | Health Connect 未安装、读取权限未授权、或设备未开放后台读取特性 | 安装 Health Connect，在 HealthScreen 先授权读取；若要后台同步，再确认设备支持并授权“后台同步” |
| 只显示 `android` / `idle` | 未授权应用使用情况权限，或系统当前无法可靠判断前台应用 | 在 StatusScreen 打开「应用使用情况权限」，并接受 Android 上 best effort 检测存在误差 |
| 没有歌曲信息 | 未授权通知访问，或当前播放器没有暴露活跃 MediaSession | 在 StatusScreen 打开「通知访问（音乐识别）」 |
| 耗电快 | 心跳间隔过低（如 10s） | 将间隔调整到 20-50s |
| Token 保存失败 | EncryptedSharedPreferences 不可用（旧设备） | SetupScreen 会显示警告，无解决方案 |
| 后台被杀 | OEM 电池优化 | StatusScreen → 忽略电池优化 + 厂商特殊设置 |

## API 接口

| 方法 | 路径 | 用途 | 调用者 |
|------|------|------|--------|
| POST | `/api/report` | 心跳上报（在线状态 + 电量 + 当前应用 + 音乐） | HeartbeatWorker |
| POST | `/api/health-data` | 上传健康数据记录 | HealthSyncWorker |
| GET | `/api/health` | 连接测试 | MainActivity |

## DataStore 配置键

| 键 | 类型 | 默认值 | 说明 |
|----|------|--------|------|
| `server_url` | String | `""` | 服务器地址（HTTPS，或局域网/本机 HTTP） |
| `report_interval` | Int | `30` | 心跳间隔，秒（10-50） |
| `health_sync_interval` | Int | `15` | 健康同步间隔，分钟（15-60） |
| `enabled_health_types` | Set\<String\> | `emptySet()` | 启用的健康数据类型 |
| `monitoring_enabled` | Boolean | `false` | 心跳是否开启 |
| `token`（加密） | String | `null` | 认证令牌（AES256-GCM） |
