# Live Dashboard
 - https://now.monikadream.homes/

实时设备活动仪表盘 —— 公开展示你正在使用的应用，拥有二次元风格 UI 和隐私优先设计。

特色功能：带猫耳装饰的视觉小说风格对话框、中文戏剧化活动描述（如"正在B站划水摸鱼喵~"）、飘落的樱花花瓣动画，以及三级隐私系统保护敏感窗口标题。

## 目录

- [主题分支](#主题分支)
- [截图](#截图)
- [功能特性](#功能特性)
- [架构](#架构)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [使用预构建 Docker 镜像（推荐）](#使用预构建-docker-镜像推荐)
- [本地开发](#本地开发)
- [环境变量](#环境变量)
- [API 参考](#api-参考)
- [Agent 配置](#agent-配置)
  - [Windows Agent](#windows-agent)
  - [macOS Agent](#macos-agent)
  - [Android App](#android-app)
- [VPS 部署指南（Docker + Nginx）](#vps-部署指南docker--nginx)
- [隐私分级系统](#隐私分级系统)
- [安全设计](#安全设计)
- [添加新应用](#添加新应用)
- [自定义](#自定义)
- [许可证](#许可证)

## 主题分支

本项目提供两个前端主题，可按喜好选择：

| 分支 | 风格 | 说明 |
|------|------|------|
| **`main`** | 经典和风 | 暖粉色系、Quicksand/Zen Maru 字体、猫耳气泡框、樱花花瓣动画 |
| **`redesign/blossom-letter`** | 花信 · 文艺书卷 | OKLCH 暖纸色系、Fraunces/Noto Serif SC 字体、双栏布局、飘落花瓣、用量图表、AI 每日总结 |
| **`redesign/pixel-room`** | 像素房间 | 像素风房间 + 日夜主题切换，还在开发中... |

```bash
# 使用经典主题（默认）
git clone https://github.com/Monika-Dream/live-dashboard.git

# 使用花信文艺主题
git clone -b redesign/blossom-letter https://github.com/Monika-Dream/live-dashboard.git

# 使用像素房间主题
git clone -b redesign/pixel-room https://github.com/Monika-Dream/live-dashboard.git
```

两个分支的后端、Agent、部署配置完全一致，仅前端 UI 不同。

## 截图

**亮色模式（设备在线）**

![亮色模式](docs/preview-main-light.png)

**暗色模式（设备离线）**

![暗色模式](docs/preview-main-dark.png)

## 功能特性

- **VN 对话框**：猫耳装饰的视觉小说气泡框，展示当前活动
- **戏剧化描述**：以保护隐私的趣味文案替代原始应用/窗口信息（如"正在用VS Code疯狂写bug喵~"）
- **富展示标题**：隐私允许时展示你正在看/听/写什么（如"正在YouTube看「Minecraft Tutorial」喵~"）
- **音乐检测**：后台检测音乐播放器（Spotify、QQ音乐、网易云等），前台非音乐应用时组合显示（如"正在用VS Code疯狂写bug，一边听Artist「Song」喵~"），音乐应用前台时底部显示 ♪ 正在听
- **AFK 检测**：Windows Agent 通过 `GetLastInputInfo` 检测键鼠空闲，超过 5 分钟（可配置）切换为心跳模式，用户返回后自动恢复
- **三级隐私系统**：SHOW / BROWSER / HIDE 三级窗口标题分类
- **樱花花瓣动画**：20 片 CSS 动画花瓣，自然飘摇效果，尊重 `prefers-reduced-motion` 设置
- **夜间模式**：当所有设备离线时（Monika 不在电脑前），页面自动切换为深紫色暗夜主题，樱花花瓣变为微弱发光的萤火效果，带有交错的呼吸动画；任一设备上线后自动恢复日间模式，过渡动画 1.2 秒
- **时间线视图**：按日聚合的时间线，带时长计算和日期选择器
- **时区感知**：前端发送时区偏移，后端正确查询本地日期
- **多设备支持**：同时支持多台设备（Windows、macOS、Android）
- **电量显示**：显示电池百分比和充电状态（仅笔记本/手机）
- **访客计数**：服务端实时在线访客数
- **自动刷新**：10 秒轮询，自动离线检测（1 分钟超时）
- **NSFW 过滤**：服务端黑名单，匹配记录静默丢弃
- **HMAC 去重**：使用 HMAC-SHA256 对窗口标题哈希去重，不存储明文

## 架构

```
                    HTTP(S) POST                              静态导出
┌──────────────┐  ──────────────→  ┌───────────────────┐  ←───────────────  ┌──────────────┐
│ Windows Agent│                   │    Bun 后端        │                   │   Next.js    │
│  (Python)    │                   │   + SQLite + HMAC  │                   │  (SSG → /out)│
├──────────────┤                   ├───────────────────┤                   ├──────────────┤
│ macOS Agent  │  ──────────────→  │  隐私分级          │  ──── 提供 ────→  │  樱花 UI     │
│  (Python)    │                   │  NSFW 过滤         │     静态文件      │  VN 对话框   │
├──────────────┤                   │  展示标题          │                   │  时间线      │
│ Android Agent│  ──────────────→  │                   │                   │              │
│(Health Connect)│                   └───────────────────┘                   └──────────────┘
└──────────────┘
```

- **通信方式**：HTTPS POST 轮询（短连接，对防火墙友好）
- **存储**：通过 `bun:sqlite` 使用 SQLite（零外部依赖）
- **前端**：10 秒自动轮询，由后端提供静态导出文件
- **数据保留**：7 天自动清理
- **隐私**：窗口标题从不以明文存储；HMAC 哈希仅用于去重
- **访客追踪**：服务端计数，随 `/api/current` 返回

## 隐私分级系统

后端将每个应用分为三个隐私等级：

| 等级 | 行为 | 示例应用 |
|------|------|---------|
| **SHOW** | 从 `window_title` 中提取有意义的标题 | YouTube、Spotify、VS Code、Steam、原神 |
| **BROWSER** | 去除浏览器后缀，检查敏感内容 | Chrome、Edge、Firefox、Safari |
| **HIDE** | `display_title` 为空，`window_title` 不存储 | Telegram、微信、Discord、银行类应用 |

### SHOW 级别

- **视频**：提取视频标题（去除"- YouTube"、"\_哔哩哔哩\_bilibili"等后缀）
- **音乐**：提取歌曲信息（处理 Spotify、foobar2000 等格式）
- **IDE**：提取项目/文件名（处理 VS Code `—`、JetBrains `–`、Sublime `-` 分隔符）
- **文档**：从 Word、Excel、Notion、Obsidian 标题中提取文档名
- **游戏/Galgame**：直接使用窗口标题作为游戏名

### BROWSER 级别

1. 去除浏览器名称后缀（处理 Edge 零宽字符和配置文件模式）
2. 如果标题包含视频网站关键词 → 显示为视频标题
3. 如果标题包含敏感关键词（邮箱、银行、登录等） → 隐藏
4. 否则 → 显示页面标题

### HIDE 级别

即时通讯、邮箱、金融、系统工具、代理工具、购物类应用 — `window_title` 在服务端直接丢弃，仅存储应用名称。

## 技术栈

| 组件 | 技术 |
|------|------|
| 后端 | [Bun](https://bun.sh/) + TypeScript + SQLite |
| 前端 | Next.js 15 + React 19 + Tailwind CSS 4（静态导出） |
| Windows Agent | Python + ctypes Win32 API + psutil |
| macOS Agent | Python + AppleScript (osascript) + psutil |
| Android Agent | Kotlin + Jetpack Compose + Health Connect + WorkManager |
| 部署 | Docker（多阶段构建）+ Nginx 反向代理 |

## 项目结构

```
live-dashboard/
├── packages/
│   ├── backend/                  # Bun 后端服务
│   │   └── src/
│   │       ├── index.ts          # HTTP 服务器 + 静态文件服务
│   │       ├── db.ts             # SQLite 模式、迁移、HMAC 哈希
│   │       ├── types.ts          # TypeScript 类型定义
│   │       ├── routes/
│   │       │   ├── report.ts     # POST /api/report（Agent 上报）
│   │       │   ├── current.ts    # GET /api/current（设备状态）
│   │       │   ├── timeline.ts   # GET /api/timeline（每日时间线）
│   │       │   └── health.ts     # GET /api/health
│   │       ├── middleware/
│   │       │   └── auth.ts       # Bearer token 认证
│   │       ├── services/
│   │       │   ├── privacy-tiers.ts  # 三级隐私 + 标题处理
│   │       │   ├── nsfw-filter.ts    # NSFW 内容过滤
│   │       │   ├── app-mapper.ts     # 进程/包名 → 展示名称
│   │       │   ├── visitors.ts       # 在线访客计数
│   │       │   └── cleanup.ts        # 7天数据清理 + 离线检测
│   │       └── data/
│   │           ├── app-names.json        # 应用名称字典
│   │           └── nsfw-blocklist.json   # NSFW 黑名单
│   │
│   └── frontend/                 # Next.js 前端
│       ├── app/                  # 页面 + globals.css（樱花、VN 样式）
│       └── src/
│           ├── components/       # CurrentStatus, DeviceCard, Timeline, Header, DatePicker
│           ├── hooks/            # useDashboard（轮询 hook）
│           └── lib/              # API 客户端 + 戏剧化应用描述
│
├── agents/
│   ├── windows/                  # Windows Agent
│   │   ├── agent.py              # 主脚本（Win32 API + 电量）
│   │   ├── config.json           # 配置文件（已 gitignore）
│   │   ├── requirements.txt      # Python 依赖
│   │   ├── build.bat             # PyInstaller 打包
│   │   └── install-task.bat      # Windows 计划任务自启动
│   │
│   ├── macos/                    # macOS Agent
│   │   ├── agent.py              # 主脚本（AppleScript + psutil）
│   │   ├── config.json           # 配置文件（已 gitignore）
│   │   ├── config.json.example   # 配置模板
│   │   └── requirements.txt      # Python 依赖
│   │
│   └── android-app/              # Android App（Health Connect 健康数据）
│       ├── live-dashboard-v2.0.apk # 编译产物
│       └── README.md             # 下载说明（源码在 android-source 分支）
│
├── deploy/nginx/                 # Nginx 配置示例
├── start.sh                      # 一键本地启动脚本
├── Dockerfile                    # 多阶段构建（前端 + 后端）
├── docker-compose.yml            # 容器编排
└── .env.example                  # 环境变量模板
```

## 本地开发

> 只想在 VPS 上跑？跳到 [VPS 部署指南](#vps-部署指南docker--nginx)。

### 一键启动（macOS）

```bash
./start.sh
```

脚本自动完成：生成随机 token 和 HASH_SECRET、安装 Bun 依赖、构建前端、创建 macOS Agent venv、启动后端（端口 3000）和 macOS Agent。访问 `http://localhost:3000` 即可。

---

### 手动启动

#### 前置要求

- [Bun](https://bun.sh/) v1.0+
- Node.js 18+（仅前端构建需要）

#### 1. 配置环境变量

```bash
cp .env.example packages/backend/.env
```

编辑 `packages/backend/.env`：

```env
# 格式：token:device_id:device_name:platform
# ⚠️ 使用冒号分隔，因此 token、device_id、device_name 中不得包含冒号（:）
DEVICE_TOKEN_1=your_secret_token:my-mac:My Mac:macos

# 生成方式：openssl rand -hex 32
HASH_SECRET=your_random_secret_here
```

#### 2. 启动后端

```bash
cd packages/backend
bun install
bun run src/index.ts
```

#### 3. 构建并提供前端

```bash
cd packages/frontend
bun install
bun run build

# 将静态构建复制到后端
cp -r out/* ../backend/public/
```

访问 `http://localhost:3000`。

## 环境变量

| 变量 | 必填 | 描述 | 示例 |
|------|------|------|------|
| `DEVICE_TOKEN_N` | 是 | 设备令牌，格式：`token:device_id:name:platform`（各字段不得含冒号） | `abc123:my-pc:My PC:windows` |
| `HASH_SECRET` | 是 | HMAC-SHA256 密钥，用于标题哈希。生成方式：`openssl rand -hex 32` | `a1b2c3d4...` |
| `PORT` | 否 | 监听端口（默认：3000） | `3000` |
| `STATIC_DIR` | 否 | 前端静态文件目录（默认：`./public`） | `./public` |
| `DB_PATH` | 否 | SQLite 数据库路径（默认：`./live-dashboard.db`） | `/data/live-dashboard.db` |

多设备支持：递增数字后缀 — `DEVICE_TOKEN_1`、`DEVICE_TOKEN_2`、`DEVICE_TOKEN_3`……

## API 参考

| 方法 | 路径 | 描述 | 认证 |
|------|------|------|------|
| POST | `/api/report` | Agent 上报当前应用 | Bearer token |
| GET | `/api/current` | 获取所有设备状态 + 访客数 | 无 |
| GET | `/api/timeline?date=YYYY-MM-DD&tz=-480` | 获取每日时间线（tz = getTimezoneOffset） | 无 |
| GET | `/api/health` | 健康检查 | 无 |

### 上报请求体

```json
{
  "app_id": "chrome.exe",
  "window_title": "GitHub - live-dashboard - Google Chrome",
  "timestamp": 1741866000000,
  "extra": {
    "battery_percent": 85,
    "battery_charging": true,
    "music": {
      "title": "Ave Mujica",
      "artist": "Ave Mujica",
      "app": "Spotify"
    }
  }
}
```

### 当前状态响应

```json
{
  "devices": [
    {
      "device_id": "my-pc",
      "device_name": "My PC",
      "platform": "windows",
      "app_name": "Chrome",
      "display_title": "GitHub - live-dashboard",
      "is_online": 1,
      "last_seen_at": "2026-03-14T12:00:00.000Z",
      "extra": { "battery_percent": 85, "battery_charging": true }
    }
  ],
  "recent_activities": [...],
  "server_time": "2026-03-14T12:00:05.000Z",
  "viewer_count": 3
}
```

## Agent 配置

### Windows Agent

1. 安装 Python 3.10+ 及依赖：
   ```bash
   pip install -r agents/windows/requirements.txt
   ```

2. 创建 `agents/windows/config.json`（此文件已 gitignore）：
   ```json
   {
     "server_url": "https://your-domain.com",
     "token": "your_device_token_here",
     "interval_seconds": 5,
     "heartbeat_seconds": 60,
     "idle_threshold_seconds": 300
   }
   ```

3. 运行：`python agents/windows/agent.py`

4. 或打包为 .exe：运行 `build.bat`，然后使用 `install-task.bat` 设置开机自启

**电量**：笔记本用户通过 `psutil.sensors_battery()` 自动获取电池信息。台式机不显示电量（正常现象）。

**音乐检测**：Agent 自动扫描所有窗口，识别已知音乐播放器（Spotify、QQ音乐、网易云、foobar2000、酷狗、酷我、AIMP 等），解析窗口标题提取歌曲和歌手信息。

**AFK 检测**：`idle_threshold_seconds`（默认 300 秒）控制无操作阈值。超过该时间无键鼠输入后，Agent 切换为心跳模式（仍保持在线但不追踪窗口变化），用户返回后自动恢复。

### macOS Agent

**前置要求**：macOS 10.14+，Python 3.10+，允许终端访问辅助功能（或通过 Accessibility 授权）。

1. 安装依赖（建议使用 venv 隔离）：
   ```bash
   cd agents/macos
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

2. 创建 `agents/macos/config.json`（参考 `config.json.example`，此文件已 gitignore）：
   ```json
   {
     "server_url": "http://your-server-ip-or-domain",
     "token": "your_device_token_here",
     "interval_seconds": 5,
     "heartbeat_seconds": 60
   }
   ```

3. 运行：
   ```bash
   .venv/bin/python agent.py
   ```

4. **开机自启动（launchd）**：
   ```bash
   # 创建 plist（替换路径为你的实际路径）
   cat > ~/Library/LaunchAgents/com.live-dashboard.agent.plist << 'EOF'
   <?xml version="1.0" encoding="UTF-8"?>
   <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
   <plist version="1.0">
   <dict>
       <key>Label</key>
       <string>com.live-dashboard.agent</string>
       <key>ProgramArguments</key>
       <array>
           <string>/path/to/live-dashboard/agents/macos/.venv/bin/python</string>
           <string>/path/to/live-dashboard/agents/macos/agent.py</string>
       </array>
       <key>RunAtLoad</key>
       <true/>
       <key>KeepAlive</key>
       <true/>
       <key>StandardOutPath</key>
       <string>/path/to/live-dashboard/agents/macos/agent.log</string>
       <key>StandardErrorPath</key>
       <string>/path/to/live-dashboard/agents/macos/agent.log</string>
       <key>WorkingDirectory</key>
       <string>/path/to/live-dashboard</string>
   </dict>
   </plist>
   EOF

   # 加载（立即生效，登录后自动启动）
   launchctl load ~/Library/LaunchAgents/com.live-dashboard.agent.plist
   ```

**工作原理**：`agent.py` 通过 AppleScript (`osascript`) 获取前台应用名和窗口标题，每 5 秒向后端上报一次。电量信息通过 `psutil.sensors_battery()` 获取。音乐检测通过 AppleScript 查询 Spotify、Apple Music、QQ音乐、网易云音乐。

**注意**：首次运行时，macOS 可能弹出权限请求，需在「系统设置 → 隐私与安全性 → 辅助功能」中授权终端或 Python。

### Android App

Android 客户端无需 root，通过 Health Connect 上传健康数据，并可选开启心跳上报（在线状态 + 电量）。

1. 从 [`agents/android-app/`](./agents/android-app/) 下载 APK 安装
2. 打开 APP，在「设置」页配置 `server_url` 和 `token`
3. 在「健康」页授权 Health Connect 权限
4. （可选）开启心跳上报

**系统要求**：Android 8.0+，需安装 [Health Connect](https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata)

源码与技术细节见 [`android-source` 分支](https://github.com/Monika-Dream/live-dashboard/tree/android-source/agents/android-app)。

## 使用预构建 Docker 镜像（推荐）

不想 clone 源码？复制下面的命令，5 分钟搞定。

### 第一步：下载配置文件

```bash
mkdir live-dashboard && cd live-dashboard

# 下载两个文件（docker-compose 和环境变量模板）
curl -LO https://raw.githubusercontent.com/Monika-Dream/live-dashboard/main/docker-compose.example.yml
curl -LO https://raw.githubusercontent.com/Monika-Dream/live-dashboard/main/.env.example

# 重命名为正式文件
mv docker-compose.example.yml docker-compose.yml
mv .env.example .env
```

### 第二步：生成密钥和设备令牌

```bash
# 生成 HASH_SECRET（必填，用于数据去重加密）
openssl rand -hex 32
# 输出示例：a1b2c3d4e5f6...（复制这一串）

# 为每台设备生成一个随机 token
openssl rand -hex 16
# 输出示例：9f8e7d6c5b4a...（每台设备各生成一次）
```

### 第三步：编辑 .env

```bash
nano .env   # 或 vim .env
```

填入刚才生成的值，格式说明：

```env
# 设备令牌格式：随机token:设备ID:设备名称:平台
# ⚠️ 冒号是分隔符，各字段本身不能包含冒号
#
# 示例：Windows 电脑
DEVICE_TOKEN_1=9f8e7d6c5b4a3210:my-pc:我的电脑:windows
#
# 示例：Android 手机（如果有）
DEVICE_TOKEN_2=abcdef1234567890:my-phone:我的手机:android
#
# 不需要的设备留空或删掉即可

# HMAC 密钥（用上面 openssl rand -hex 32 生成的那串）
HASH_SECRET=这里粘贴你生成的64位随机字符串
```

**关键信息**：`.env` 里的 `DEVICE_TOKEN_1=xxx:my-pc:...` 中冒号前的 `xxx` 部分就是你的 **设备密钥**，Agent（Windows/macOS/Android）配置时填的 `token` 就是这个值。

### 第四步：启动

```bash
docker compose up -d
```

访问 `http://你的服务器IP:3000` 即可看到仪表盘（此时没有设备数据，会显示离线夜间模式）。内网环境直接用 HTTP 就行；如果是公网 VPS，建议配合 Nginx 反向代理 + HTTPS（参考下方 [VPS 部署指南](#vps-部署指南docker--nginx) 第五步），避免 token 明文传输。

### 第五步：配置 Agent

服务端跑起来后，在你的设备上安装对应的 Agent，把数据上报过来：

- **Windows**：`agents/windows/config.json` 里的 `token` 填 `.env` 中冒号前的那段密钥，`server_url` 填 `https://你的域名`
- **macOS**：同上，配置 `agents/macos/config.json`
- **Android**：APP 设置页直接输入 URL 和 token

详见下方 [Agent 配置](#agent-配置) 章节。

### 更新镜像

```bash
docker compose pull && docker compose up -d
```

> **安全提醒**：永远不要把真实 token 写进 `docker-compose.yml`，务必使用 `.env` 文件，且不要提交 `.env` 到版本控制。

---

## VPS 部署指南（Docker + Nginx）

以下是从零开始在 VPS 上部署的完整步骤。

### 前置要求

| 项目 | 说明 |
|------|------|
| Linux VPS | Ubuntu 20.04+ / Debian 11+ 推荐，1 核 512MB 内存即可 |
| Docker | Docker Engine 20.10+ 和 Docker Compose V2 |
| Nginx | 作为反向代理，处理 HTTPS 和速率限制 |
| 域名 | 需要一个域名指向 VPS IP，用于 HTTPS |

如果 VPS 还没有 Docker，先安装：

```bash
# Ubuntu / Debian
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# 退出并重新登录，使 docker 组生效
```

### 第一步：克隆项目

```bash
cd ~
git clone https://github.com/Monika-Dream/live-dashboard.git
cd live-dashboard
```

> 如果想用花信文艺主题，改为：`git clone -b redesign/blossom-letter ...`

### 第二步：配置环境变量

```bash
cp .env.example .env
```

用编辑器打开 `.env`（vim、nano 均可），按以下说明填写：

```env
# ──────────────────────────────────────────────────────────────
# 设备令牌（每台设备一行）
# 格式：随机密钥:设备ID:设备名称:平台
# ⚠️ 冒号是分隔符，所以各字段本身不能包含冒号
# ──────────────────────────────────────────────────────────────

# 你的 Windows 电脑
DEVICE_TOKEN_1=abc123def456:my-pc:My PC:windows

# 你的 Android 手机（如果有）
DEVICE_TOKEN_2=xyz789ghi012:my-phone:My Phone:android

# ──────────────────────────────────────────────────────────────
# HMAC 密钥（必填，用于窗口标题哈希去重，不设则服务器拒绝启动）
# ──────────────────────────────────────────────────────────────
HASH_SECRET=这里替换为下面命令生成的随机字符串
```

生成随机令牌和密钥：

```bash
# 生成设备令牌（用作 DEVICE_TOKEN 的密钥部分）
openssl rand -hex 16
# 输出示例：a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6

# 生成 HASH_SECRET
openssl rand -hex 32
# 输出示例：1a2b3c4d5e6f...（64 个十六进制字符）
```

将生成的随机字符串填入 `.env` 对应位置即可。

### 第三步：配置 Docker 网络

项目使用 Docker 外部网络，这样容器可以和同一 VPS 上的 Nginx（或其他服务）通信。

```bash
# 如果你还没有 Docker 网络，创建一个
docker network create my_network

# 查看已有网络（如果你之前已有其他项目的网络，可以复用）
docker network ls
```

然后编辑 `docker-compose.yml`，将最后几行的网络名称改为你的实际网络名：

```yaml
networks:
  dm_network:
    external: true
    name: my_network  # ← 改成你刚创建的（或已有的）网络名
```

> 如果你不需要与其他容器通信，也可以删掉整个 `networks` 配置，改为暴露端口：
> 在 `services.dashboard` 下添加 `ports: ["3000:3000"]`，然后 Nginx 代理到 `127.0.0.1:3000`。

### 第四步：构建并启动

```bash
docker compose up -d --build
```

首次构建需要下载镜像和安装依赖，视网络速度可能需要几分钟。构建完成后检查：

```bash
# 查看容器状态（应该显示 Up）
docker ps | grep live_dashboard

# 查看启动日志（确认没有报错）
docker logs live_dashboard --tail 30

# 你应该能看到类似这样的输出：
#   Server running on port 3000
#   Static files: /app/public
#   Schema migration complete
```

如果日志中出现 `HASH_SECRET is required` 错误，说明 `.env` 中的 `HASH_SECRET` 没有正确设置，回到第二步检查。

### 第五步：配置 Nginx 反向代理

项目提供了 Nginx 配置模板 `deploy/nginx/example.conf`，你需要复制并修改它。

**1. 添加速率限制区域**

编辑 Nginx 主配置 `/etc/nginx/nginx.conf`，在 `http {}` 块内添加一行：

```nginx
http {
    # ... 其他配置 ...
    limit_req_zone $binary_remote_addr zone=dashboard_api:2m rate=10r/s;
}
```

**2. 创建站点配置**

```bash
sudo cp deploy/nginx/example.conf /etc/nginx/sites-available/dashboard.conf
sudo ln -s /etc/nginx/sites-available/dashboard.conf /etc/nginx/sites-enabled/
sudo vim /etc/nginx/sites-available/dashboard.conf
```

需要修改的地方：

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;          # ← 改成你的域名

    ssl_certificate /path/to/cert.pem;    # ← 改成你的证书路径
    ssl_certificate_key /path/to/key.key; # ← 改成你的私钥路径

    # 如果容器使用外部网络（第三步的方式），代理到容器 IP:
    # proxy_pass http://172.20.0.80:3000;
    #
    # 如果容器暴露了端口（ports 方式），代理到本机:
    # proxy_pass http://127.0.0.1:3000;
}
```

> **SSL 证书**：可以用 [Let's Encrypt](https://certbot.eff.org/)（免费）或 Cloudflare 源证书。
> Let's Encrypt 快速设置：`sudo apt install certbot python3-certbot-nginx && sudo certbot --nginx -d your-domain.com`

**3. 测试并重载 Nginx**

```bash
sudo nginx -t                # 检查配置语法
sudo systemctl reload nginx  # 重载配置（不中断现有连接）
```

### 第六步：验证部署

在浏览器打开 `https://your-domain.com`，你应该能看到仪表盘页面（此时没有设备数据，会显示所有设备离线的夜间模式）。

用 curl 测试 API：

```bash
# 健康检查
curl https://your-domain.com/api/health
# 预期：{"status":"ok"}

# 当前状态（此时 devices 应该为空数组）
curl https://your-domain.com/api/current
# 预期：{"devices":[],"recent_activities":[],"server_time":"...","viewer_count":1}
```

### 第七步：配置客户端 Agent

部署完成后，在你的设备上安装 Agent，让它开始向服务器上报数据。详见上方 [Agent 配置](#agent-配置) 章节。

配置要点：
- `server_url` 填你的域名（如 `https://your-domain.com`），必须是 HTTPS
- `token` 填 `.env` 中 `DEVICE_TOKEN_N` 冒号前的那段密钥（如 `abc123def456`）
- Agent 运行后，刷新仪表盘页面，几秒内就能看到设备上线和当前活动

### 更新部署

当你 push 了新代码到 GitHub 后，在 VPS 上更新：

```bash
cd ~/live-dashboard
git pull origin main
docker compose up -d --build
```

Docker 会自动重建变更的部分（有缓存，通常比首次构建快很多）。SQLite 数据保存在 Docker volume 中，重建容器不会丢失数据。

### 常见问题

| 问题 | 解决方法 |
|------|---------|
| 容器启动后立刻退出 | `docker logs live_dashboard` 查看错误。通常是 `.env` 缺少必填项 |
| 页面打不开（502） | 检查 Nginx 的 `proxy_pass` 地址是否和容器实际 IP/端口一致 |
| Agent 上报失败（401） | 检查 Agent 的 `token` 是否和 `.env` 中 `DEVICE_TOKEN` 冒号前的部分完全一致 |
| Agent 上报失败（连接超时） | 确认域名 DNS 解析正确、VPS 防火墙开放了 443 端口 |
| 页面显示但没有数据 | Agent 在运行吗？`curl https://your-domain.com/api/current` 看 `devices` 是否有内容 |
| 时间线日期不对 | 前端自动发送时区偏移，确认浏览器时区设置正确 |

## 安全设计

- **设备认证**：通过环境变量配置的每设备 Bearer token（不存储在代码中）
- **身份绑定**：Token 在服务端解析为 `device_id`；请求体中的 `device_id` 被忽略
- **隐私分级**：三级分类；HIDE 级别的应用在写入数据库前丢弃 `window_title`
- **HMAC 哈希**：使用 HMAC-SHA256（带密钥）对 `window_title` 哈希去重；无密钥不可逆
- **NSFW 过滤**：服务端黑名单，匹配记录静默丢弃
- **去重**：SQLite 唯一约束 `(device_id, app_id, title_hash, time_bucket)` + `ON CONFLICT DO NOTHING`
- **路径遍历防护**：路径规范化 + 相对路径检查 + realpath 符号链接验证
- **URL 安全验证**：HTTPS 始终放行；HTTP 仅限私网（Python Agent 通过 DNS 解析 + `ipaddress.is_global` 校验，Android 仅允许 localhost/127.0.0.1）
- **速率限制**：Nginx `limit_req` 限制上报端点
- **XSS 防护**：React JSX 默认转义、`Content-Type: application/json`、`X-Content-Type-Options: nosniff`
- **非 Root 容器**：Docker 以非特权 `dashboard` 用户运行
- **离线检测**：设备超过 1 分钟无活动标记为离线

## 添加新应用

要添加对新应用的支持：

1. **`packages/backend/src/data/app-names.json`** — 映射进程名（Windows）或包名（Android）到展示名称
2. **`packages/backend/src/services/privacy-tiers.ts`** — 分配隐私等级（SHOW/BROWSER/HIDE），如适用则添加到对应分类集合（`ideApps`、`musicApps` 等）
3. **`packages/frontend/src/lib/app-descriptions.ts`** — 添加戏剧化描述和可选的标题模板

## 自定义

### 更换主题

编辑 `packages/frontend/app/globals.css` 中的 CSS 变量：

```css
@theme {
  --color-cream: #FFF8E7;        /* 页面背景 */
  --color-sakura-bg: #FFF0F3;    /* 樱花色调 */
  --color-card: #FFFDF7;         /* 卡片背景 */
  --color-border: #E8D5C4;       /* 卡片边框 */
  --color-primary: #E8A0BF;      /* 主色调粉色（猫耳、花瓣、装饰） */
  --color-secondary: #88C9C9;    /* 辅助色青色 */
  --color-accent: #E8B86D;       /* 点缀色金色 */
}
```

夜间模式颜色在 `body.night-mode` 中覆盖，默认为深紫色系：

```css
body.night-mode {
  --color-cream: #1a1a2e;        /* 深蓝紫背景 */
  --color-sakura-bg: #1e1e30;    /* 深紫樱花色调 */
  --color-card: #242440;         /* 暗紫卡片背景 */
  --color-border: #3a3a5c;       /* 柔和紫灰边框 */
  --color-primary: #9b7bb8;      /* 淡紫主色调 */
  --color-secondary: #5a8a8a;    /* 暗青辅助色 */
  --color-accent: #b8944d;       /* 暖金点缀色 */
}
```

### 更换描述

编辑 `packages/frontend/src/lib/app-descriptions.ts`。每个应用包含：
- 通用描述（无 `display_title` 时使用）
- 可选的标题模板（有 `display_title` 时使用）

## 许可证

MIT
