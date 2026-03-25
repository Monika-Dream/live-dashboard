# Live Dashboard — Windows Agent

监控前台窗口并向 Live Dashboard 后端上报应用使用状态，支持系统托盘常驻运行。

## 快速开始

从 [GitHub Releases](https://github.com/Monika-Dream/live-dashboard/releases) 下载 `live-dashboard-agent.exe`，将 `config.json` 放在同目录下，双击运行即可。

## 从源码运行

**需要**: Python 3.10+

1. 安装依赖：
   ```bash
   pip install -r requirements.txt
   ```
2. 复制 `config.example.json` 为 `config.json`，填入你的信息：
   ```json
   {
     "server_url": "https://your-domain.com",
     "token": "你的设备密钥",
     "interval_seconds": 5,
     "heartbeat_seconds": 60,
     "idle_threshold_seconds": 300
   }
   ```
3. 运行：
   ```bash
   python agent.py
   ```

## 打包为 .exe

运行 `build.bat`，会用 PyInstaller 打包为单文件 `dist/live-dashboard-agent.exe`。

将 `config.json` 放在 `.exe` 同目录下即可运行。

## 开机自启

将 `.exe` 和 `config.json` 放在固定目录后，以管理员身份运行 `install-task.bat`，会创建 Windows 任务计划在登录时自动启动。

## 配置说明

| 字段 | 说明 | 默认值 |
|------|------|--------|
| `server_url` | 后端地址 | 必填 |
| `token` | 设备密钥（部署服务端时生成的） | 必填 |
| `interval_seconds` | 上报间隔（秒） | `5` |
| `heartbeat_seconds` | AFK 时心跳间隔（秒） | `60` |
| `idle_threshold_seconds` | 无操作多久后进入 AFK 模式（秒） | `300` |

## 功能

### 系统托盘

启动后常驻系统托盘，图标颜色反映当前状态（绿色=在线，灰色=AFK/离线）。

右键菜单：
- 查看当前状态和正在使用的应用
- 打开配置文件 / 重载配置
- 设置对话框（编辑服务器地址、Token、上报间隔等）
- 安全退出

### 前台应用检测

实时检测当前前台窗口的应用和标题，通过 Win32 API 获取进程信息。

### 音乐检测

自动识别 Spotify、QQ音乐、网易云、foobar2000、酷狗、酷我、AIMP 等播放器，从窗口标题解析正在播放的歌曲信息。

### 电量上报

笔记本自动上报电池电量和充电状态，台式机不显示（正常行为）。

### AFK 检测

无键鼠输入超过阈值（默认 300 秒）后进入 AFK 模式，切换为低频心跳上报。

**视频/音频免 AFK**：当检测到以下情况时，即使键鼠空闲也不会进入 AFK：
- 系统有活跃音频流（通过 pycaw 检测，覆盖所有播放器和浏览器视频）
- 前台窗口处于全屏状态（通过 Win32 API 比对窗口尺寸与屏幕分辨率）

典型场景：看视频、听音乐、全屏演示时不会被标记为 AFK。

### 日志

运行日志自动写入 `live-dashboard-agent.log`，按天轮转保留 2 天。

## 技术栈

- **Win32 API**: 前台窗口检测、空闲时间、全屏检测
- **pystray + Pillow**: 系统托盘图标和菜单
- **pycaw**: Windows Core Audio API，检测活跃音频会话
- **psutil**: 电池信息
- **tkinter**: 设置对话框（Python 内置）
