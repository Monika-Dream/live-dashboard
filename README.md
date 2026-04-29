# Live Dashboard

这是一个可以实时展示“你正在用什么应用”的网页看板。示例:https://xuyihong.icu/   qq交流群1093496287

你要的核心点先说结论：
- 可以直接在网页里添加/更新/删除多人面板。
- 可以在 `3001` 管理面板里直接添加主面板设备（Token、设备 ID、设备名、平台）。
- 新增主面板设备后会立即显示在主面板；设备未开始上报前会显示为离线。
- 不需要改 `.env`，也不需要重新构建镜像。
- 只要先设置好管理密码（`ADMIN_TOKEN` 或 `ADMIN_PASSWORD`）即可。
- 默认端口分离：`3000` 只看主面板，`3001` 才显示管理面板。
- 默认管理密码是 `123456`（建议上线后立即修改）。

---

## 下载链接（按你的要求）

| 平台 | 下载链接 | 说明 |
|---|---|---|
| Windows | https://github.com/nmb1337/live-dashboard/releases/latest/download/live-dashboard-windows-agent-win-x64.zip | 你的 Windows App 链接 |
| macOS | https://github.com/Monika-Dream/live-dashboard/releases | 原作者链接 |
| Android | https://github.com/nmb1337/live-dashboard/releases/latest/download/live-dashboard-android-agent.apk | 你的 Android App 链接 |

---

## 部署方式 1：Windows（PowerShell + Docker Desktop）

### 1. 先准备

1. 安装并启动 Docker Desktop。
2. 打开 PowerShell。
3. 进入项目目录：

```powershell
Set-Location D:\live-dashboard-main
```

### 2. 一键启动（推荐）

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
.\deploy\windows-dockerdesktop-local.ps1
```

脚本会自动：
- 生成/修复 `.env`
- 生成设备 token
- 写入默认管理密码（`ADMIN_TOKEN=123456`，可自行修改）
- 构建并启动容器

### 3. 手动启动（docker run）

如果你不想用一键脚本，也可以手动部署。

先在项目目录构建镜像：

```powershell
Set-Location D:\live-dashboard-main
docker build -t live-dashboard:local .
```

Windows（PowerShell）先生成密钥：

```powershell
# 设备密钥（每台设备各生成一个，记下来）
-join((1..16)|%{'{0:x2}'-f(Get-Random -Max 256)})

# HASH_SECRET（服务端内部用，只需一个）
-join((1..32)|%{'{0:x2}'-f(Get-Random -Max 256)})
```

然后运行容器（下面是你提供的示例）：

```powershell
docker run -d --name live-dashboard `
	-p 3000:3000 `
	-p 3001:3001 `
	-v dashboard_data:/data `
	-e "HASH_SECRET=d21d3ab874d8d0f30f59885efa82dec0e470b837788495fd57198f9dbfdb7d17" `
	-e "DEVICE_TOKEN_1=9efb4f39438e8e892006fef7ccac2cdb:pc-1:5050 5600x:windows" `
	-e "DEVICE_TOKEN_2=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6:phone-1:vivox200s:android" `
	-e "DISPLAY_NAME=xuyihong" `
	-e "SITE_TITLE=xuyihong Now" `
	-e "SITE_DESC=What is xuyihong doing right now?" `
	-e "ADMIN_TOKEN=123456" `
	-e "EXTERNAL_DASHBOARDS=[{""id"":""aloys23"",""name"":""DBJD-CR"",""url"":""https://livedashboard.aloys23.link""},{""id"":""ailucat"",""name"":""八九四"",""url"":""https://live.ailucat.top""},{""id"":""fun91"",""name"":""Monika"",""url"":""https://live.91fun.asia""}]" `
	live-dashboard:local
```

说明：
- 设备密钥请替换为你自己生成的值，每台设备都要不同。
- `HASH_SECRET` 只需要一个，用你自己生成的值替换示例值。
- `ADMIN_TOKEN=123456` 是当前默认管理密码，建议上线后改为强密码。

### 4. 验证

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health
```

浏览器打开：
- http://127.0.0.1:3000
- http://127.0.0.1:3001

说明：
- `3000` 是展示页（不给管理入口）。
- `3001` 是管理页（有“多人面板管理”，需输入管理密码）。

---

## 部署方式 2：Linux（Docker）

### 1. 准备 `.env`

```bash
cd /path/to/live-dashboard-main
cp .env.example .env
```

### 1.1 先生成密钥（每台设备一个 + 服务端一个）

每台设备需要一个独立的设备密钥，另外还需要一个服务端密钥（`HASH_SECRET`）。

Linux / macOS：

```bash
# 设备密钥（每台设备各生成一个，记下来）
openssl rand -hex 16

# HASH_SECRET（服务端内部用，只需一个）
openssl rand -hex 32
```

说明：
- 每台设备的“设备密钥”都要不同。
- `HASH_SECRET` 整个服务只需要配置一个。
- 生成出的设备密钥，作为 `DEVICE_TOKEN_N=密钥:device_id:device_name:platform` 里的“密钥”部分使用。

编辑 `.env`，至少改这几项：

```env
DEVICE_TOKEN_1=你的设备token:my-pc:My PC:linux
HASH_SECRET=你自己的随机字符串
ADMIN_TOKEN=你自己的管理密码
```

### 2. 启动

先准备外部网络（`docker-compose.yml` 默认使用 `your_external_network`）：

```bash
docker network create your_external_network || true
```

如果你要使用其他网络名，请先修改 [docker-compose.yml](docker-compose.yml) 里的网络配置。

```bash
docker compose up -d --build
```

### 3. 验证

```bash
curl http://127.0.0.1:3000/api/health
```

浏览器打开：
- `http://127.0.0.1:3000`（展示页）
- `http://127.0.0.1:3001`（管理页）

---

## 如何设置“管理面板密码”

支持两种变量（设置一个即可）：
- `ADMIN_TOKEN`
- `ADMIN_PASSWORD`

如果两个都设置了，后端会同时接受这两个值。

默认值：`123456`

### 密码设置位置（最重要）

管理密码写在项目根目录的 `.env` 文件里：

- Windows 路径示例：`D:\live-dashboard-main\.env`
- Linux 路径示例：`/path/to/live-dashboard-main/.env`

也就是说，你只需要改 `.env`，不是改前端代码。

### 直接可用的设置方法

Windows（PowerShell）：

```powershell
Set-Location D:\live-dashboard-main
Copy-Item .env.example .env -Force

# 二选一（推荐只保留一个）
Add-Content .env "ADMIN_TOKEN=your_strong_password_here"
# 或
Add-Content .env "ADMIN_PASSWORD=your_strong_password_here"
```

Linux：

```bash
cd /path/to/live-dashboard-main
cp .env.example .env

# 二选一（推荐只保留一个）
echo 'ADMIN_TOKEN=your_strong_password_here' >> .env
# 或
echo 'ADMIN_PASSWORD=your_strong_password_here' >> .env
```

设置后重启容器：

```powershell
docker compose up -d --build
```

查看当前是否已设置：

Windows（PowerShell）：

```powershell
Get-Content .env | Select-String "ADMIN_TOKEN|ADMIN_PASSWORD"
```

Linux：

```bash
grep -E 'ADMIN_TOKEN|ADMIN_PASSWORD' .env
```

示例：

```env
ADMIN_TOKEN=your_strong_password_here
# 或
ADMIN_PASSWORD=your_strong_password_here
```

修改后重启：

```powershell
docker compose up -d --build
```

---

## 网页里管理多人面板和主面板设备（无需改 .env、无需重建）

打开管理页 `http://你的服务器IP:3001` 后，在“多人面板管理”区域：

1. 输入管理密码（`ADMIN_TOKEN` 或 `ADMIN_PASSWORD` 的值）
2. 填写面板信息（ID、名称、URL、描述可选）
3. 点击“添加 / 更新面板”
4. 删除时点击“删除 xxx”

说明：
- 新增/更新/删除会立刻生效。
- 不需要修改 `.env`。
- 不需要重新构建 Docker 镜像。
- `3000` 端口不会显示管理面板，适合对外只读展示。

### 在 3001 管理面板新增主面板设备

打开管理页 `http://你的服务器IP:3001`，在“主面板设备（Token 与名称）”区域：

1. 输入管理密码并解锁。
2. 填写设备 ID（如 `phone-1`）、设备名称、设备 Token、平台。
3. 点击“添加 / 更新主面板设备”。

说明：
- 设备配置保存后会立刻出现在主面板设备列表。
- 如果设备还没开始上报，主面板会先显示该设备为离线。
- 删除“runtime”来源设备后，主面板会移除该覆盖项（若同 device_id 在 `.env` 里存在，则会回退到 `.env` 配置）。

### 多人面板部署方法（推荐）

你可以用下面这个最简单流程：

1. 先把主站部署好（Windows 或 Linux 任意一种方式都行）。
2. 在网页“多人面板管理”里输入管理密码解锁。
3. 逐个添加外部面板：
	- 面板 ID：例如 `friend-alice`
	- 显示名称：例如 `Alice`
	- 面板 URL：例如 `https://alice.example.com`
4. 点击“添加 / 更新面板”，页面会立即出现新面板。

补充说明：
- 这种方式会把面板保存到数据库卷里，容器重启后依然保留。
- 如果你执行了清空数据卷（例如 `docker compose down -v`），数据库里的面板也会被清掉。

---

## 多设备部署方法

只要每台设备使用不同的 `DEVICE_TOKEN_N`，就可以同时上报并在同一个看板显示。

Token 格式固定为：

`token:device_id:device_name:platform`

`platform` 常用值：
- Windows 设备：`windows`
- Android 设备：`android`
- macOS 设备：`macos`
- Linux 设备：`linux`

### 示例：2 台电脑 + 2 台手机

```env
DEVICE_TOKEN_1=token_pc_1:pc-1:Office-PC:windows
DEVICE_TOKEN_2=token_phone_1:phone-1:My-Phone:android
DEVICE_TOKEN_3=token_pc_2:pc-2:Home-Mac:macos
DEVICE_TOKEN_4=token_phone_2:phone-2:Backup-Phone:android
```

把这些写入 `.env` 后，执行：

```powershell
docker compose up -d
```

然后在每台客户端里填对应 token，即可在网页上同时看到多设备状态。

---

## 常用命令

```powershell
# 查看日志
docker logs --tail 100 live_dashboard

# 重启容器
docker restart live_dashboard

# 重新构建并启动
docker compose up -d --build

# 停止
docker compose down
```

---

## 常见问题

### 1) 网页里添加/删除面板失败

先检查：
- 管理密码是否输入正确
- `.env` 是否有 `ADMIN_TOKEN` 或 `ADMIN_PASSWORD`

### 2) 看不到“多人面板管理”区域

执行：

```powershell
docker compose up -d --build
```

然后浏览器强制刷新（Ctrl+F5）。

并确认你访问的是 `3001` 端口（`3000` 默认不显示管理面板）。

### 3) 只有网址的人能不能乱改？

不能。

因为新增/更新/删除必须带管理密码（后端鉴权），没密码会返回 401。

---

## 许可证

MIT
