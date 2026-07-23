# Live Dashboard — Linux Agent 源码

> `linux-source` 分支 — Linux 桌面端 Agent 源码（issue #46）
>
> 服务端部署、前端功能、API 参考等通用文档请参阅 [`main` 分支 README](https://github.com/Monika-Dream/live-dashboard/tree/main#readme)。

## 下载

预编译版本可从 [GitHub Releases](https://github.com/Monika-Dream/live-dashboard/releases) 下载 `live-dashboard-agent-linux`。

## 这个分支包含什么

Linux Agent 是一个 Python 桌面程序，监控前台窗口并向 Live Dashboard 后端实时上报应用使用状态。启动后常驻系统托盘运行。

### 功能

| 功能 | 说明 |
|------|------|
| **前台应用检测** | 分层通道：Sway (swaymsg) / Hyprland (hyprctl) / X11 及 XWayland (xprop)，启动时自动探测 |
| **音乐检测** | MPRIS D-Bus（Linux 标准媒体协议）——Spotify、VLC、mpv、浏览器等全部支持；playerctl 优先，gdbus 兜底 |
| **电量上报** | 通过 psutil 获取笔记本电池电量和充电状态 |
| **AFK 检测** | xprintidle → GNOME Mutter IdleMonitor → org.freedesktop.ScreenSaver 依序探测键鼠空闲 |
| **视频/音频免 AFK** | 有音频播放（pactl sink-inputs）或前台全屏时不进入 AFK |
| **系统托盘** | pystray 托盘图标：状态查看、开机自启（XDG autostart）、日志开关、设置、退出 |

### 会话环境支持

| 环境 | 前台窗口 |
|------|---------|
| X11（任意桌面）/ Sway / Hyprland | ✅ 完整支持 |
| GNOME / KDE 纯 Wayland | ⚠️ 仅 XWayland 应用可识别（合成器不向第三方暴露原生窗口，无解）；在线状态/电池/音乐不受影响 |

### 技术栈

- Python 3.10+ / PyInstaller 打包
- swaymsg / hyprctl / xprop — 前台窗口分层检测
- gdbus (MPRIS) + playerctl — 音乐播放器查询
- pystray + Pillow — 托盘图标
- psutil — 电池信息
- xprintidle / D-Bus IdleMonitor — 空闲检测；pactl — 音频状态

### 文件结构

```
agents/linux/
├── agent.py              # 主程序（单文件实现）
├── config.example.json   # 配置模板
├── requirements.txt      # Python 依赖
└── README.md             # 详细使用说明（依赖安装、支持矩阵、自启动）
```

## 构建

```bash
pip install -r agents/linux/requirements.txt pyinstaller
cd agents/linux
pyinstaller --onefile --name live-dashboard-agent agent.py
# 产物: dist/live-dashboard-agent
```

## 使用

详见 [`agents/linux/README.md`](agents/linux/README.md)。
