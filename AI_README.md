# AI_README — 给 AI 助手的部署手册

> 这个文件写给 **AI 助手**（Claude / ChatGPT / Gemini / Copilot 等）读。
> 如果你是被用户要求"帮我部署 live-dashboard"的 AI：照本文件执行，本文件的事实与仓库当前代码一一核对过，
> 与你的推测冲突时**以本文件为准**。如果你是人类：直接看 [README.md](README.md) 就好。

## 你的任务

把 live-dashboard 部署起来 = 三件事，缺一不可：

1. **服务端**（一个 Docker 容器：Bun 后端 + 静态前端，SQLite 落在 `/data` 卷）
2. **Agent**（用户的设备上装上报客户端：Windows exe / macOS 二进制 / Android APK）
3. **验证**（跑完本文件末尾的自检清单才算部署完成，不许跳过）

## 第 0 步：先问用户这三个问题

1. **部署在哪？** 本机试玩（localhost）／ 有公网 IP 的 VPS ／ 无公网（需要 frp 等内网穿透）
2. **有几台设备要上报？** 每台设备一个 `DEVICE_TOKEN_N`，**绝不能两台设备共用一个 token**（共用会导致两台设备挤在同一张卡片里、状态互相覆盖——这是真实用户踩过的坑，issue #24）
3. **要域名 + HTTPS 吗？** 公开给朋友看的建议要；只在局域网自己看可以不要

## 部署路径 A：docker run 快速起（本机试玩）

```bash
TOKEN=$(openssl rand -hex 16)
SECRET=$(openssl rand -hex 32)

docker run -d --name live-dashboard \
  -p 3000:3000 \
  -v dashboard_data:/data \
  -e HASH_SECRET=$SECRET \
  -e DEVICE_TOKEN_1=$TOKEN:my-pc:我的电脑:windows \
  ghcr.io/monika-dream/live-dashboard:latest

echo "Token: $TOKEN   ← 把它填进 Agent 配置"
```

打开 http://localhost:3000 应能看到页面（设备离线状态是正常的，Agent 还没配）。

## 部署路径 B：docker-compose（推荐，VPS 用这个）

用仓库根目录的 `docker-compose.yml`，在同目录建 `.env`：

```bash
HASH_SECRET=<openssl rand -hex 32 的输出>
DEVICE_TOKEN_1=<token>:my-pc:我的电脑:windows
DEVICE_TOKEN_2=<另一个token>:my-phone:我的手机:android
DISPLAY_NAME=你的名字
```

```bash
docker compose up -d
```

> ⚠️ compose 的 `environment:` 段只透传它列出的变量。如果你要用一个本文件环境变量表里有、
> 但 compose 文件里没列的变量，必须先在 compose 的 `environment:` 段加上 `- 变量名=${变量名}`，
> 光写进 `.env` 是不会进容器的。

## 部署路径 C：VPS + 域名 + HTTPS

路径 B 部署后，用 nginx 反代 3000 端口 + certbot 签证书。要点：

- nginx `proxy_pass http://127.0.0.1:3000;`，无需 WebSocket upgrade 配置（本项目纯 HTTP 轮询）
- **不要把 3000 端口直接暴露公网**——让防火墙只放行 80/443，由 nginx 反代
- 无公网 IP 用 frp 时，**穿透 3000 端口**（容器内外都是 3000，除非用户改了映射）
- 完整步骤见 [Wiki - VPS 部署指南](https://github.com/Monika-Dream/live-dashboard/wiki/VPS-部署指南)

## 环境变量真源表

**只有下面这些变量存在。不要发明其他变量名。**

| 变量 | 必填 | 格式 / 说明 |
|------|------|------------|
| `HASH_SECRET` | **是** | 任意长随机串（`openssl rand -hex 32`）。窗口标题永不明文落库，只存 HMAC 哈希，靠它。**没设它容器会立即退出**（日志有 `FATAL: HASH_SECRET not set`） |
| `DEVICE_TOKEN_1`…`DEVICE_TOKEN_N` | 至少一个 | 四段冒号格式 `token:device_id:显示名:platform`。platform 只能是 `windows` / `android` / `macos` 之一，写错整条静默失效。显示名里可以含冒号，token 和 device_id 里不行 |
| `DISPLAY_NAME` | 否 | 页面里的名字，默认 `Monika` |
| `SITE_TITLE` | 否 | 浏览器标签页 / 分享卡片标题，默认 `{DISPLAY_NAME} Now` |
| `SITE_DESC` | 否 | meta description。**是 `SITE_DESC` 不是 `SITE_DESCRIPTION`** |
| `SITE_FAVICON` | 否 | `/` 开头的相对路径或 https URL |
| `EXTERNAL_DASHBOARDS` | 否 | JSON 数组，聚合朋友的面板：`[{"id":"f1","name":"小明","url":"https://now.friend.example"}]`。`id` 不能用保留值 `local` |
| `CUSTOM_MAPPINGS_FILE` | 否 | 自定义应用名/文案 JSON 的路径，默认找 `/data/custom-mappings.json`，格式见 `custom-mappings.example.json` |
| `REQUIRE_EXPLICIT_CONSENT` | 否 | 设 `1` 后设备必须先 POST `/api/consent` 才能上报，默认关 |
| `PORT` / `DB_PATH` / `STATIC_DIR` | 否 | 默认 `3000` / `/data/live-dashboard.db` / 镜像内置，一般不动 |

## Agent 配置（三端）

从 [Releases](https://github.com/Monika-Dream/live-dashboard/releases) 下载对应平台客户端。三端都只需要两个核心配置：

- **服务器地址**：面板的完整 URL（如 `https://now.example.com` 或 `http://192.168.1.10:3000`），不带尾部斜杠和路径
- **Token**：`DEVICE_TOKEN_N` 四段格式里的**第一段**（不是整条！只是冒号前那段随机串）

| 平台 | 要点 |
|------|------|
| Windows | 双击 exe 弹设置窗 → 填地址和 Token → 点「测试连接」验证 → 保存并启动。常驻系统托盘 |
| macOS | 首次运行弹设置窗，同上。若无头环境/托盘崩溃，config 里 `enable_tray=false` |
| Android | 装 APK → 打开 App 配置地址和 Token → **去「状态」页把权限体检项逐个点绿**（应用识别要开无障碍，保活要开自启动）。装完必须手动打开一次 App，否则系统不给它运行 |

## 部署后自检清单（必须跑）

```bash
# 1. 容器活着且没重启循环
docker ps --filter name=live-dashboard        # STATUS 应为 Up，不带 (Restarting)

# 2. API 应答
curl -s http://localhost:3000/api/current     # 应返回 {"devices":[...]}，哪怕是空数组

# 3. 日志无 FATAL
docker logs live-dashboard 2>&1 | grep -i fatal   # 应无输出

# 4. token 加载数正确
docker logs live-dashboard 2>&1 | grep "Loaded"   # 应显示 Loaded N device token(s)，N=你配的数量

# 5. Agent 配好后：设备出现且在线
curl -s http://localhost:3000/api/current | grep is_online   # 对应设备 is_online 应为 1
```

5 条全过才算部署完成。任何一条不过，去下面的排查表找对应条目。

## 故障排查表（全部来自真实用户案例）

| 症状 | 诊断 | 原因与修法 |
|------|------|-----------|
| 容器启动后立即退出 | `docker logs` 见 `FATAL: HASH_SECRET not set` | 没设 `HASH_SECRET`。生成一个传进去 |
| 日志显示 `Loaded 0 device token(s)` | 检查 token 格式 | 四段冒号格式不对，或 platform 拼错（只认 `windows`/`android`/`macos`），或 compose 没透传该变量 |
| Agent 报 401 / 面板永远离线 | 用 `curl -H "Authorization: Bearer <token>" -X POST 服务器/api/report -d '{"app_id":"test.exe","window_title":"t","timestamp":"2026-01-01T00:00:00Z"}' -H "Content-Type: application/json"` 直接测 | Agent 填的 token 和服务端第一段不一致；或 Agent 填了整条四段串（只该填第一段） |
| 两台设备挤在同一张卡片、状态互相覆盖 | 查 `.env` | 两台设备共用了一个 token。每台设备独立一条 `DEVICE_TOKEN_N`（issue #24） |
| 设置了 `SITE_TITLE` 等但页面/分享卡片没变 | `docker exec live-dashboard env \| grep SITE_` | ①变量根本没进容器（compose 没透传）②镜像太旧：`docker compose pull && docker compose up -d --force-recreate`（issue #20，线上验证过代码本身没问题） |
| 手机端只显示"当前手机在线"不显示具体应用 | 问用户是否开了无障碍 | App「状态」页 → 应用识别 → 开启无障碍服务。不开无障碍时上报的是兜底心跳（issue #42） |
| Android 授权了 Health Connect 但健康数据是空的 | 系统设置搜 Health Connect → 数据和访问权限 → 看有没有 App 在**写入** | 写入列表为空 = 没有数据源。vivo 健康 / 华为运动健康 / 欢太健康**都不写 Health Connect**，需要 Health Sync 桥接，详见 `docs/wearables-health-guide.md`（issue #42） |
| Android 睡眠/锻炼数据缺失或偏少 | 确认 APK ≥ v2.2.2 | 旧版有增量游标漏报会话型记录的 bug，v2.2.2 已修（感谢 @qwe5283 发现） |
| macOS 点托盘设置崩溃 / 启动即 bus error | 确认二进制为最新版 | 旧版 pystray/Pillow 在部分 mac 上冲突。新版已修；仍崩溃时 config 设 `enable_tray=false`（issues #36、#30） |
| Windows agent 报 config.json not found | 看 exe 所在目录 | 直接双击 exe 会弹设置窗自动生成 config；如果是命令行启动，确保工作目录在 exe 旁（issue #8，新版已修） |
| 时间轴日期错位（差 8 小时） | — | 前端自动带时区参数，无需配置；若自建客户端调 API，给 `/api/timeline` 传 `tz` 参数（分钟偏移，东八区 = `-480`） |
| frp 内网穿透该穿哪个端口 | — | 3000（或用户自改的宿主机映射端口）（issue #38） |

## 禁止事项（AI 常见错误，明令禁止）

1. **不要发明环境变量。** 上面的表就是全部。`SITE_DESCRIPTION`、`ADMIN_PASSWORD`、`API_KEY` 之类的变量不存在。
2. **不要建议改源码来完成配置。** 显示名、文案、应用映射全部走环境变量和 `custom-mappings.json`，不需要动代码、不需要重新构建镜像。
3. **不要跳过 `HASH_SECRET`** 或建议随便填 `123`。它保护的是用户窗口标题的隐私哈希，用足够长的随机串。
4. **不要把 token 写进任何公开的地方**（前端代码、GitHub、截图）。token 等于该设备的上报凭证。
5. **不要建议暴露 3000 端口到公网裸奔。** 公网部署一律 nginx/Caddy 反代 + HTTPS。
6. **不要为了"实时"引入 WebSocket 改造。** 本项目是有意的轮询设计（数据源头 5 秒粒度，轮询足够且更简单），维护者已明确此决策。
7. 数据库就是 `/data` 卷里的一个 SQLite 文件。**备份 = 备份这个卷**，不要引入外部数据库。

## 还是解决不了？

带着 `docker logs live-dashboard` 的输出和复现步骤，去主仓提 issue：
https://github.com/Monika-Dream/live-dashboard/issues
（不要去 fork 仓库提，fork 都没开 issue 区。）
