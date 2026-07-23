# Live Dashboard — Linux Agent

监听前台窗口 / 音乐播放 / 电池状态，上报到 Live Dashboard 后端（issue #46）。

## 支持矩阵

| 会话环境 | 前台窗口 | 空闲检测 | 音乐 (MPRIS) |
|---------|---------|---------|--------------|
| X11（任意桌面） | ✅ xprop | ✅ xprintidle | ✅ |
| Sway | ✅ swaymsg IPC | ✅ D-Bus | ✅ |
| Hyprland | ✅ hyprctl IPC | ✅ D-Bus | ✅ |
| GNOME Wayland | ⚠️ 仅 XWayland 应用 | ✅ Mutter IdleMonitor | ✅ |
| KDE Wayland | ⚠️ 仅 XWayland 应用 | ✅ org.freedesktop.ScreenSaver | ✅ |

GNOME / KDE 的**纯 Wayland 会话不向第三方程序暴露前台窗口信息**（合成器安全设计，
无通用接口）。此时原生 Wayland 应用在前台时 agent 退化为心跳模式（在线状态 + 电池 +
音乐仍正常）；XWayland 应用（不少游戏、Electron 老版本等）仍可正常识别。
想要完整体验请用 X11 会话或 Sway / Hyprland。

## 安装

```bash
# 1. Python 依赖
pip install -r requirements.txt

# 2. 系统工具（多数发行版已自带，缺哪个装哪个）
# Debian/Ubuntu:
sudo apt install x11-utils xprintidle playerctl
# Arch:
sudo pacman -S xorg-xprop xprintidle playerctl
# Fedora:
sudo dnf install xprop xprintidle playerctl

# 3. 配置
cp config.example.json config.json
chmod 600 config.json   # token 在里面，别给其他用户读
# 编辑 config.json 填 server_url 和 token；或直接运行，首次会弹设置窗口

# 4. 运行
python3 agent.py
```

系统工具都是可选的，缺了对应功能自动降级：没有 `xprintidle` 会尝试 D-Bus 空闲接口；
没有 `playerctl` 会直接解析 MPRIS D-Bus；没有 `pactl`（极少见）只是失去"播放音频时
不判定离开"的豁免。

## 配置项

| 键 | 默认 | 说明 |
|----|------|------|
| `server_url` | — | 后端地址；HTTPS 或内网 HTTP |
| `token` | — | 设备 token（服务端 `.env` 里 `DEVICE_TOKEN_N` 的第一段） |
| `interval_seconds` | 5 | 前台窗口轮询间隔 |
| `heartbeat_seconds` | 60 | 无变化时的心跳上报间隔 |
| `idle_threshold_seconds` | 300 | 无键鼠输入判定"离开"的秒数 |
| `enable_log` | false | 写文件日志（按天轮转，保留 2 天） |
| `enable_tray` | true | 系统托盘；Wayland 无 AppIndicator 时自动降级无托盘 |

服务端 `.env` 的 token 四段格式中 platform 填 `linux`：

```
DEVICE_TOKEN_3=<token>:<device_id>:<设备名>:linux
```

## 自启动

托盘菜单勾选「开机自启」即可——写入 `~/.config/autostart/live-dashboard-agent.desktop`
（XDG autostart，图形会话登录时拉起）。取消勾选即删除。

## 隐私

与 Windows / macOS agent 相同：窗口标题只用于服务端隐私分级生成安全的
`display_title`，**原文不落库**；应用名映射、私密应用匿名化全部在服务端完成，
agent 不做任何本地判断。
