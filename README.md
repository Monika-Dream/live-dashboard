# Live Dashboard — Windows Agent 源码

> `windows-source` 分支 — Windows 桌面端 Agent 源码
>
> 服务端部署、前端功能、API 参考等通用文档请参阅 [`main` 分支 README](https://github.com/Monika-Dream/live-dashboard/tree/main#readme)。

## 下载

预编译 exe 可从 [GitHub Releases](https://github.com/Monika-Dream/live-dashboard/releases) 直接下载，无需安装 Python。

## 这个分支包含什么

Windows Agent 是一个 Python 桌面程序，监控前台窗口并向 Live Dashboard 后端实时上报应用使用状态。打包为单文件 exe，常驻系统托盘运行。

### 功能

| 功能 | 说明 |
|------|------|
| **前台应用检测** | Win32 API 实时获取前台窗口进程名和标题 |
| **音乐检测** | 识别 Spotify、QQ音乐、网易云、foobar2000、酷狗、酷我、AIMP 等，从窗口标题解析歌曲信息 |
| **电量上报** | 笔记本自动上报电池电量和充电状态 |
| **AFK 检测** | 键鼠空闲超过阈值（默认 5 分钟）后进入 AFK 模式 |
| **视频/音频免 AFK** | 有音频播放（pycaw）或前台全屏时，即使键鼠空闲也不进入 AFK |
| **系统托盘** | pystray 托盘图标，右键查看状态、重载配置、打开设置、安全退出 |
| **设置对话框** | tkinter GUI，编辑服务器地址、Token、上报间隔等 |
| **日志** | 自动写入 `live-dashboard-agent.log`，按天轮转保留 2 天 |

### 技术栈

- Python 3.10+ / PyInstaller 打包
- Win32 API (ctypes) — 窗口检测、空闲时间、全屏检测
- pystray + Pillow — 系统托盘
- pycaw — Windows Core Audio API，活跃音频会话检测
- psutil — 电池信息
- tkinter — 设置对话框（Python 内置）

### 文件结构

```
agents/windows/
├── agent.py              # 主程序（792 行）
├── config.example.json   # 配置模板
├── requirements.txt      # Python 依赖
├── build.bat             # PyInstaller 打包脚本
├── install-task.bat      # Windows 任务计划自启动
└── README.md             # 详细使用说明
```

## 构建

```bash
pip install -r agents/windows/requirements.txt pyinstaller
cd agents/windows
pyinstaller --onefile --noconsole --name live-dashboard-agent agent.py
# 产物: dist/live-dashboard-agent.exe
```

或直接运行 `build.bat`。

## 使用

详见 [`agents/windows/README.md`](agents/windows/README.md)。
