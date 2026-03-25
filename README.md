# Live Dashboard — macOS Agent 源码

> `macos-source` 分支 — macOS 桌面端 Agent 源码
>
> 服务端部署、前端功能、API 参考等通用文档请参阅 [`main` 分支 README](https://github.com/Monika-Dream/live-dashboard/tree/main#readme)。

> **注意**：macOS Agent 已实现全部功能，但由于缺少 macOS 测试环境，尚未经过实机验证。如有问题欢迎 [提 issue](https://github.com/Monika-Dream/live-dashboard/issues)。

## 下载

预编译版本可从 [GitHub Releases](https://github.com/Monika-Dream/live-dashboard/releases) 下载 `live-dashboard-agent-macos.zip`。

## 这个分支包含什么

macOS Agent 是一个 Python 桌面程序，监控前台窗口并向 Live Dashboard 后端实时上报应用使用状态。启动后常驻菜单栏运行。

### 功能

| 功能 | 说明 |
|------|------|
| **前台应用检测** | 通过 AppleScript 获取前台应用名和窗口标题 |
| **音乐检测** | 查询 Spotify、Apple Music、QQ音乐、网易云音乐的播放状态和歌曲信息 |
| **电量上报** | 通过 psutil 获取 MacBook 电池电量和充电状态 |
| **AFK 检测** | IOKit `HIDIdleTime` 检测键鼠空闲，超过阈值（默认 5 分钟）后进入 AFK |
| **视频/音频免 AFK** | 有音频播放（pmset assertions）或前台全屏（AXFullScreen）时不进入 AFK |
| **系统托盘** | pystray 菜单栏图标，右键查看状态、重载配置、安全退出 |

### 技术栈

- Python 3.10+ / PyInstaller 打包
- AppleScript (osascript) — 前台应用检测、全屏状态、音乐播放器查询
- pystray + Pillow — 菜单栏图标
- psutil — 电池信息
- ioreg / pmset — 空闲时间和音频状态检测

### 文件结构

```
agents/macos/
├── agent.py              # 主程序（747 行）
├── config.example.json   # 配置模板
├── requirements.txt      # Python 依赖
└── README.md             # 详细使用说明
```

## 构建

```bash
pip install -r agents/macos/requirements.txt pyinstaller
cd agents/macos
pyinstaller --onefile --windowed --name live-dashboard-agent agent.py
# 产物: dist/live-dashboard-agent
```

## 权限要求

首次运行时需在「系统设置 → 隐私与安全性 → 辅助功能」中授权终端或 Python，否则无法获取窗口标题。

## 使用

详见 [`agents/macos/README.md`](agents/macos/README.md)。
