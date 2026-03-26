# Live Dashboard Android App — 代码指南

> 更新：2026-03-22

## 构建与部署

- **最低 SDK**：见 `app/build.gradle.kts` → `minSdk` (26)
- **构建**：`./gradlew assembleDebug`（在 `agents/android-app/` 下执行）
- **APK 输出**：`app/build/outputs/apk/debug/app-debug.apk`
- **安装**：`adb install -r app/build/outputs/apk/debug/app-debug.apk`

## 设计决策

- **无前台应用检测**：Android 非 root 下无法可靠获取前台应用。小米 HyperOS 通过 cgroup v2 freezer 冻结无障碍服务，导致不可用。前台应用由 PC 端上报。
- **无音乐监听**：v2 移除了 NotificationListenerService，简化为健康数据工具。
- **仅 WorkManager**：HeartbeatWorker 使用自调度 OneTimeWorkRequest 绕过 15 分钟最小周期。底层 AlarmManager 即使被冻结也能唤醒。
- **心跳默认关闭**：不是所有用户都需要显示手机在线，作为可选功能。

## 关键流程

### 心跳流程（可选）
1. 用户在 SetupScreen 点击「开始监听」→ `HeartbeatWorker.schedule(context, interval)`
2. HeartbeatWorker 延迟触发 → 读取电量信息
3. `ReportClient.reportApp()` POST 到 `/api/report`，包含 `appId="android"` + 电量
4. Worker 自调度下一个 OneTimeWorkRequest
5. 通过 AlarmManager 存活于小米进程冻结

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
| 耗电快 | 心跳间隔过低（如 10s） | 将间隔调整到 20-50s |
| Token 保存失败 | EncryptedSharedPreferences 不可用（旧设备） | SetupScreen 会显示警告，无解决方案 |
| 后台被杀 | OEM 电池优化 | StatusScreen → 忽略电池优化 + 厂商特殊设置 |

## API 接口

| 方法 | 路径 | 用途 | 调用者 |
|------|------|------|--------|
| POST | `/api/report` | 心跳上报（电量 + 在线状态） | HeartbeatWorker |
| POST | `/api/health-data` | 上传健康数据记录 | HealthSyncWorker |
| GET | `/api/health` | 连接测试 | MainActivity |

## DataStore 配置键

| 键 | 类型 | 默认值 | 说明 |
|----|------|--------|------|
| `server_url` | String | `""` | 服务器地址（必须 HTTPS） |
| `report_interval` | Int | `30` | 心跳间隔，秒（10-50） |
| `health_sync_interval` | Int | `15` | 健康同步间隔，分钟（15-60） |
| `enabled_health_types` | Set\<String\> | `emptySet()` | 启用的健康数据类型 |
| `monitoring_enabled` | Boolean | `false` | 心跳是否开启 |
| `token`（加密） | String | `null` | 认证令牌（AES256-GCM） |
