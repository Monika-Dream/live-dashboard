# Live Dashboard — Android App 源码

> `android-source` 分支 — Android 客户端源码
>
> 服务端部署、前端功能、API 参考等通用文档请参阅 [`main` 分支 README](https://github.com/Monika-Dream/live-dashboard/tree/main#readme)。

## 下载

预编译 APK 可从 [GitHub Releases](https://github.com/Monika-Dream/live-dashboard/releases) 直接下载安装。

## 这个分支包含什么

Android 客户端是一个 Kotlin + Jetpack Compose 应用，通过 Health Connect 上传健康数据（步数、心率、睡眠等），并可选开启心跳上报（在线状态 + 电量 + 当前应用 + 音乐信息）。无需 root。

### 功能

| 功能 | 说明 |
|------|------|
| **Health Connect 同步** | 读取步数、心率、睡眠、血氧、体温等 18 种健康数据，定时上传到服务端 |
| **增量同步** | DataStore 持久化 `lastSyncTimestamp`，增量查询（带 5 分钟重叠窗口），服务端去重 |
| **全量同步** | 健康页面「全量同步」按钮，强制 7 天回溯查询，防止时间戳过期 |
| **后台静默同步** | 三态特性检测（可用/不支持/检测异常），Android 15+ 支持后台自动同步 |
| **当前应用检测** | 基于 UsageStats best effort 识别前台应用，无 root，不读取页面内容 |
| **音乐检测** | 基于 MediaSession + 通知访问读取正在播放的歌曲信息 |
| **心跳上报** | 可选功能，10–50 秒间隔（默认 30 秒），上报在线状态、电池、当前应用和音乐信息 |
| **电量上报** | 自动上报电池电量和充电状态 |
| **连接状态检测** | 每 5 秒测试服务器连接，顶栏实时显示连接状态 |
| **诊断日志** | APP 内 DebugLog 页面查看同步日志，方便排查问题 |

### 技术栈

- Kotlin + Jetpack Compose（Material 3）
- Health Connect SDK (`androidx.health.connect:connect-client`)
- WorkManager — 后台定时同步，支持网络约束和指数退避
- DataStore — 持久化配置和同步状态
- EncryptedSharedPreferences — Token 加密存储

### 系统要求

- Android 8.0+ (API 26)
- [Health Connect](https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata)（Google Play 安装）

### 文件结构

```
agents/android-app/
├── app/
│   ├── build.gradle.kts              # 构建配置（SDK 版本、依赖）
│   └── src/main/
│       ├── AndroidManifest.xml
│       └── java/com/monika/dashboard/
│           ├── MainActivity.kt        # 入口 + 导航
│           ├── DashboardApp.kt        # Application 类
│           ├── data/
│           │   ├── SettingsStore.kt    # DataStore 配置管理
│           │   └── DebugLog.kt        # 内存日志（UI 查看）
│           ├── health/
│           │   ├── HealthConnectManager.kt  # HC 权限、读取、特性检测
│           │   └── HealthSyncWorker.kt      # WorkManager 同步任务
│           ├── network/
│           │   └── ReportClient.kt    # HTTP 上报客户端
│           └── ui/screens/
│               ├── SetupScreen.kt     # 服务器配置
│               ├── StatusScreen.kt    # 状态总览 + 权限诊断
│               ├── HealthScreen.kt    # 健康数据管理
│               └── DebugLogScreen.kt  # 日志查看
├── BUILD.md                           # 构建指南
├── GUIDE.md                           # 代码指南（架构、流程、API）
├── build.gradle.kts                   # 项目级构建
├── gradle/                            # Gradle wrapper
└── settings.gradle.kts
```

## 构建

```bash
cd agents/android-app
./gradlew assembleDebug
# 产物: app/build/outputs/apk/debug/app-debug.apk
```

详见 [`BUILD.md`](agents/android-app/BUILD.md)。

## 架构与代码指南

详见 [`GUIDE.md`](agents/android-app/GUIDE.md)，包含：
- 心跳流程、连接检测流程、健康数据同步流程
- 设计决策（为什么前台应用检测是 best effort、为什么用 WorkManager 自调度等）
- API 接口和 DataStore 配置键
- 常见问题排查
