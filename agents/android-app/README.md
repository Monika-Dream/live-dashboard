# Live Dashboard Android App

配合 [Live Dashboard](https://github.com/Monika-Dream/live-dashboard) 使用的 Android 客户端。

## 功能

- **Health Connect 数据同步**：自动读取手机健康数据（心率、步数、睡眠等 17 种类型），定时上传至你的 Live Dashboard 服务器
- **心跳上报（可选）**：默认关闭。开启后定时上报手机在线状态和电量信息，让网页端显示手机在线

## 安装使用

1. 从 [main 分支](https://github.com/Monika-Dream/live-dashboard/tree/main/agents/android-app) 下载 APK 安装
2. 打开 APP，在「设置」页配置服务器地址和 Token，点击保存
3. 切到「健康」页，授权 Health Connect 权限并选择要同步的数据类型
4. （可选）在「设置」页开启心跳上报

**系统要求**：Android 8.0+ (API 26)，需安装 [Health Connect](https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata)

## 构建

见 [BUILD.md](./BUILD.md)。

## 架构

```
MainActivity (Compose UI, 3 tabs)
  ├─ SetupScreen     → 服务器地址 + Token 配置 + 心跳开关
  ├─ HealthScreen    → Health Connect 权限 + 数据类型 + 同步间隔
  └─ StatusScreen    → 权限检查 + 调试日志

Workers (WorkManager):
  ├─ HeartbeatWorker    → 可选，周期性上报在线状态 + 电量 (30-300s)
  └─ HealthSyncWorker   → 周期性 Health Connect 数据同步 (15-60 min)
```

详细代码说明见 [GUIDE.md](./GUIDE.md)。

## 更新日志

### v2.0 — 2026-03-22

**架构简化**：从全功能监控工具简化为健康数据上传工具。

- 移除音乐监听服务（MusicListenerService）
- 移除前台应用监控服务（AppMonitorService）
- 心跳功能改为可选（默认关闭），开启后上报在线状态 + 电量
- 图标更新：粉色底 + 白色心形
- 清理不再需要的权限（RECEIVE_BOOT_COMPLETED、FOREGROUND_SERVICE_DATA_SYNC、通知监听）

> 由于 Android 系统限制，无法可靠获取当前前台应用信息（无障碍服务在国产 ROM 上会被系统冻结），因此本 APP 定位为健康数据上传工具。前台应用监控由 PC 端负责。
