# Live Dashboard — macOS Agent

监控前台窗口并向 Live Dashboard 后端上报应用使用状态，支持系统托盘常驻运行。

> **注意**：macOS Agent 已实现全部功能，但由于缺少 macOS 测试环境，尚未经过实机验证。如有问题欢迎 [提 issue](https://github.com/Monika-Dream/live-dashboard/issues)。

## 快速开始

从 [GitHub Releases](https://github.com/Monika-Dream/live-dashboard/releases) 下载 `live-dashboard-agent-macos.zip`，解压后将 `config.json` 放在同目录下运行即可。

## 从源码运行

**需要**: macOS 10.14+, Python 3.10+

1. 创建虚拟环境并安装依赖（推荐）：
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
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
   .venv/bin/python agent.py
   ```

> 首次运行时，macOS 会弹出权限请求，需在「系统设置 → 隐私与安全性 → 辅助功能」中授权终端或 Python。

## 开机自启（launchd）

```bash
cat > ~/Library/LaunchAgents/com.live-dashboard.agent.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.live-dashboard.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>/替换为实际路径/macos-agent/.venv/bin/python</string>
        <string>/替换为实际路径/macos-agent/agent.py</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>WorkingDirectory</key>
    <string>/替换为实际路径/macos-agent</string>
</dict>
</plist>
EOF

launchctl load ~/Library/LaunchAgents/com.live-dashboard.agent.plist
```

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

启动后常驻菜单栏，图标颜色反映当前状态（绿色=在线，灰色=AFK/离线）。

右键菜单：
- 查看当前状态和正在使用的应用
- 打开配置文件 / 重载配置
- 安全退出

### 前台应用检测

通过 AppleScript 获取前台应用名和窗口标题。

### 音乐检测

查询 Spotify、Apple Music、QQ音乐、网易云音乐的播放状态，解析正在播放的歌曲信息。

### 电量上报

通过 psutil 获取电池电量和充电状态（MacBook 适用）。

### AFK 检测

通过 `ioreg -c IOHIDSystem` 读取 `HIDIdleTime` 获取键鼠空闲时间，超过阈值（默认 300 秒）后进入 AFK 模式。

**视频/音频免 AFK**：当检测到以下情况时，即使键鼠空闲也不会进入 AFK：
- 系统有活跃音频输出（通过 `pmset -g assertions` 检查 CoreAudiod 是否持有 PreventUserIdleSleep）
- 前台窗口处于全屏模式（通过 AppleScript 读取 `AXFullScreen` 属性）

典型场景：看视频、听音乐、全屏演示时不会被标记为 AFK。

## 技术栈

- **AppleScript**: 前台应用检测、全屏状态检测、音乐播放器查询
- **pystray + Pillow**: 系统托盘图标和菜单
- **psutil**: 电池信息
- **ioreg / pmset**: 空闲时间和音频状态检测
