# Live Dashboard

实时设备活动仪表盘 —— 公开展示你正在使用的应用，拥有二次元风格 UI 和隐私优先设计。

特色功能：带猫耳装饰的视觉小说风格对话框、中文戏剧化活动描述（如"正在B站划水摸鱼喵~"）、飘落的樱花花瓣动画，以及三级隐私系统保护敏感窗口标题。

## 主题分支

本项目提供两个前端主题，可按喜好选择：

| 分支 | 风格 | 说明 |
|------|------|------|
| **`main`** | 经典和风 | 暖粉色系、Quicksand/Zen Maru 字体、柔和樱花花瓣 |
| **`redesign/magical-girl`** | 魔法少女 | 薰衣草紫/薄荷绿/蜜桃橘、Dela Gothic One/M PLUS Rounded 1c 字体、星星+爱心粒子、萤火虫夜间模式 |

```bash
# 使用经典主题（默认）
git clone https://github.com/Monika-Dream/live-dashboard.git

# 使用魔法少女主题
git clone -b redesign/magical-girl https://github.com/Monika-Dream/live-dashboard.git
```

两个分支的后端、Agent、部署配置完全一致，仅前端 UI 不同。

## 截图

> TODO: 添加截图

## 功能特性

- **VN 对话框**：猫耳装饰的视觉小说气泡框，展示当前活动
- **戏剧化描述**：以保护隐私的趣味文案替代原始应用/窗口信息（如"正在用VS Code疯狂写bug喵~"）
- **富展示标题**：隐私允许时展示你正在看/听/写什么（如"正在YouTube看「Minecraft Tutorial」喵~"）
- **三级隐私系统**：SHOW / BROWSER / HIDE 三级窗口标题分类
- **樱花花瓣动画**：20 片 CSS 动画花瓣，自然飘摇效果，尊重 `prefers-reduced-motion` 设置
- **夜间模式**：当所有设备离线时（Monika 不在电脑前），页面自动切换为深紫色暗夜主题，樱花花瓣变为微弱发光的萤火效果，带有交错的呼吸动画；任一设备上线后自动恢复日间模式，过渡动画 1.2 秒
- **时间线视图**：按日聚合的时间线，带时长计算和日期选择器
- **时区感知**：前端发送时区偏移，后端正确查询本地日期
- **多设备支持**：同时支持多台设备（Windows、Android）
- **电量显示**：显示电池百分比和充电状态（仅笔记本/手机）
- **访客计数**：服务端实时在线访客数
- **自动刷新**：10 秒轮询，自动离线检测（1 分钟超时）
- **NSFW 过滤**：服务端黑名单，匹配记录静默丢弃
- **HMAC 去重**：使用 HMAC-SHA256 对窗口标题哈希去重，不存储明文

## 架构

```
                    HTTPS POST                                静态导出
┌──────────────┐  ──────────────→  ┌───────────────────┐  ←───────────────  ┌──────────────┐
│ Windows Agent│                   │    Bun 后端        │                   │   Next.js    │
│  (Python)    │                   │   + SQLite + HMAC  │                   │  (SSG → /out)│
├──────────────┤                   ├───────────────────┤                   ├──────────────┤
│ Android Agent│  ──────────────→  │  隐私分级          │  ──── 提供 ────→  │  樱花 UI     │
│ (Magisk/KSU) │                   │  NSFW 过滤         │     静态文件      │  VN 对话框   │
└──────────────┘                   │  展示标题          │                   │  时间线      │
                                   └───────────────────┘                   └──────────────┘
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
| Android Agent | Shell 脚本（Magisk/KernelSU 模块） |
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
│   └── android/                  # Android Agent（Magisk/KSU 模块）
│       ├── service.sh            # 主脚本（dumpsys + curl）
│       ├── config.sh             # 配置文件（已 gitignore）
│       └── module.prop           # 模块元数据
│
├── deploy/nginx/                 # Nginx 配置示例
├── Dockerfile                    # 多阶段构建（前端 + 后端）
├── docker-compose.yml            # 容器编排
└── .env.example                  # 环境变量模板
```

## 快速开始

### 前置要求

- [Bun](https://bun.sh/) v1.0+
- Node.js 18+（仅前端构建需要）

### 1. 配置环境变量

```bash
cp .env.example packages/backend/.env
```

编辑 `packages/backend/.env`：

```env
# 格式：token:device_id:device_name:platform
# ⚠️ 使用冒号分隔，因此 token、device_id、device_name 中不得包含冒号（:）
DEVICE_TOKEN_1=your_secret_token:my-pc:My PC:windows

# 生成方式：openssl rand -hex 32
HASH_SECRET=your_random_secret_here
```

### 2. 启动后端

```bash
cd packages/backend
bun install
bun run src/index.ts
```

### 3. 构建并提供前端

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
    "battery_charging": true
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
     "heartbeat_seconds": 60
   }
   ```

3. 运行：`python agents/windows/agent.py`

4. 或打包为 .exe：运行 `build.bat`，然后使用 `install-task.bat` 设置开机自启

**电量**：笔记本用户通过 `psutil.sensors_battery()` 自动获取电池信息。台式机不显示电量（正常现象）。

### Android Agent（Magisk / KernelSU）

1. 创建 `agents/android/config.sh`（已 gitignore）：
   ```bash
   SERVER_URL="https://your-domain.com"
   TOKEN="your_device_token_here"
   ```

2. 作为 Magisk/KernelSU 模块安装（将 `agents/android/` 文件夹打包为 zip）

3. `service.sh` 脚本在后台运行，通过轮询 `dumpsys` 获取前台应用

## Docker 部署

```bash
# 1. 配置
cp .env.example .env
# 编辑 .env，填写你的 token 和 HASH_SECRET

# 2. 创建 Docker 网络（如果使用外部网络配合 Nginx）
docker network create your_network_name

# 3. 修改 docker-compose.yml
# - 将网络名称改为你的实际名称
# - 按需调整 ipv4_address

# 4. 构建并启动
docker compose up -d --build

# 5. 查看日志
docker logs live_dashboard --tail 50
```

Dockerfile 使用多阶段构建：第一阶段构建 Next.js 前端，第二阶段运行 Bun 后端并提供静态输出。容器以非 root 用户运行。

### Nginx 反向代理

参考 `deploy/nginx/example.conf` 获取配置示例。关键点：

- 对 `/api/report` 进行速率限制，防止滥用
- 代理头部配置，确保正确获取客户端 IP
- 使用你自己的证书（或 Cloudflare 源证书）配置 HTTPS

## 安全设计

- **设备认证**：通过环境变量配置的每设备 Bearer token（不存储在代码中）
- **身份绑定**：Token 在服务端解析为 `device_id`；请求体中的 `device_id` 被忽略
- **隐私分级**：三级分类；HIDE 级别的应用在写入数据库前丢弃 `window_title`
- **HMAC 哈希**：使用 HMAC-SHA256（带密钥）对 `window_title` 哈希去重；无密钥不可逆
- **NSFW 过滤**：服务端黑名单，匹配记录静默丢弃
- **去重**：SQLite 唯一约束 `(device_id, app_id, title_hash, time_bucket)` + `ON CONFLICT DO NOTHING`
- **路径遍历防护**：路径规范化 + 相对路径检查 + realpath 符号链接验证
- **强制 HTTPS**：Windows agent 拒绝非 HTTPS 的 `server_url`
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
