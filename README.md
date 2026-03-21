# Live Dashboard

这是我基于原作者版本继续修改的一版个人使用分支。

原版本已经有基础的设备活动上报、当前状态展示和视觉小说风格 UI；我这边主要不是重做底层，而是围绕“我自己每天怎么看这些数据更顺手”做了一轮偏使用体验的重构。

现在这个版本主要关注三件事：

- 后台音乐要真的可用，尤其是 QQ 音乐。
- 时间线和浏览历史不要碎，要能看懂
- 页面上的信息要更像“我今天在干什么”的总结，而不是原始日志堆叠

## 我相对原版本主要改了什么

### 1. 重做了 QQ 音乐后台识别链路

原来的实现更偏前台窗口识别，对我这种“QQ 音乐在后台播歌”的使用方式不稳定。

我做的调整：

- macOS Agent 不再只依赖前台窗口标题判断 QQ 音乐
- 改成通过 `media-control get` 读取系统媒体会话
- 只认 `bundleIdentifier = com.tencent.QQMusicMac`
- 后端把当前音乐写进 `device_states.extra.music`
- 后端新增 `music_history`，单独记录当天播放过的音乐

结果是：

- “音乐喵”现在看的是后台真实播放状态
- “今日听过的歌单”也不再依赖前台时间线

### 2. 把“今日音乐合集”从前台活动里拆出来

原版本更接近“当前状态展示”，但我这里需要的是“今天听过什么”。

我做的调整：

- 新增音乐历史存储
- 前端歌单改读 `music_history`
- 歌单默认展示前 4 条
- 点开后展示当天去重后的音乐列表
- 去掉了错误的“重复播放次数”展示，因为原始上报频率会把次数算偏

### 3. 重做了浏览器历史阅读体验

原始时间线里浏览器活动太碎，连续打开同一个网页会变成很多条，很难读。

我做的调整：

- 浏览器标题会先清洗，去掉 `- Isabelle`、`- Google Chrome - Isabelle` 这类后缀
- 连续多条相同网页标题会自动合并成一条
- 合并条目支持展开，看每次具体时间
- 浏览器历史弹窗顶部增加整体概览
- 会显示当天最常读的前三网页

### 4. 重做了任务时间线

原版本更像普通时间线列表，但我自己更需要的是：

- 现在在干什么
- 过去某一段时间主要在干什么

我做的调整：

- 当前任务改成“最近 15 分钟内活跃的活动”
- 当前任务按应用归并
- 当前任务文案统一走原项目里那套戏剧化描述，例如“正在用命令行敲命令喵~”
- 其他时段任务改成 24 小时网格时间轴
- 横轴是时间，按小时推进
- 每小时一列，每列 6 个 10 分钟格子
- 支持拖动选择一个时间段查看详情
- 也支持手动输入开始和结束时间查询
- 时段弹窗顶部会先总结“这段时间主要在干啥”和前三事件

### 5. 调整了页面信息分工

我把一些原本混在一起的信息拆开了：

- 顶部状态气泡只负责说“现在在干什么”
- 音乐信息不再混在顶部小字里
- 音乐只留在独立的“音乐喵”模块
- 设备、音乐、浏览历史、任务时间线各自负责不同层级的信息

### 6. 增加了适合我自己开发的启动方式

原项目有自己的本地启动方式，但我这里同时在改原项目和 worktree，直接沿用不够顺手。

我补了：

- `start-dev.sh`

它会：

- 杀掉旧的前端、后端和重复 Agent
- 用当前 worktree 代码启动前后端
- 连接真实数据库
- 启动修过的 macOS Agent

这个主要是为了避免多个旧 Agent 同时运行、互相覆盖当前状态。

## 现在这版实际数据链路

### 当前状态

Agent 上报到后端 `/api/report` 后，后端会更新 `device_states`，前端通过 `/api/current` 读取：

- 当前应用
- 展示标题
- 在线状态
- 电量信息
- 当前音乐 `extra.music`

### 时间线

后端 `/api/timeline` 返回两类数据：

- `segments`
  用于当前任务、其他时段任务、浏览器历史
- `music_history`
  用于今日音乐合集

这意味着：

- 音乐喵看的是当前状态里的 `extra.music`
- 今日听过的歌单看的是 `music_history`

两者已经解耦。

## 保留了原项目的基础架构

底层架构没有推翻，还是沿用原项目这套：

- 后端：Bun + TypeScript + SQLite
- 前端：Next.js 15 + React 19 + Tailwind CSS 4
- macOS Agent：Python + AppleScript + `media-control`
- Windows Agent：Python
- Android Agent：Shell

## 关键变化落在哪些文件

如果要看我主要改动，大致在这些地方：

- `agents/macos/agent.py`
  QQ 音乐后台识别改成系统媒体会话
- `packages/backend/src/routes/report.ts`
  当前音乐与音乐历史的写入逻辑
- `packages/backend/src/db.ts`
  `music_history` 表
- `packages/frontend/src/components/MusicStatus.tsx`
  音乐喵
- `packages/frontend/src/components/MusicPlaylist.tsx`
  今日音乐合集
- `packages/frontend/src/components/BrowserHistory.tsx`
  浏览器历史聚合与概览
- `packages/frontend/src/components/DetailedTimeline.tsx`
  当前任务与其他时段任务重构
- `packages/frontend/src/components/CurrentStatus.tsx`
  顶部状态信息分工调整
- `packages/frontend/src/lib/app-descriptions.ts`
  沿用原项目的戏剧化活动文案

## 项目结构

```text
live-dashboard/
├── packages/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── db.ts
│   │   │   ├── types.ts
│   │   │   └── routes/
│   │   │       ├── current.ts
│   │   │       ├── health.ts
│   │   │       ├── report.ts
│   │   │       └── timeline.ts
│   │   └── live-dashboard.db
│   └── frontend/
│       ├── app/
│       └── src/
│           ├── components/
│           ├── hooks/
│           └── lib/
├── agents/
│   ├── macos/
│   ├── windows/
│   └── android/
├── start.sh
└── start-dev.sh
```

## 数据表

### `activities`

记录活动时间线原始条目。

### `device_states`

记录每台设备当前最新状态。

额外信息放在 `extra` 里，例如：

- 电量
- 充电状态
- 当前音乐

### `music_history`

记录后台音乐播放历史，用于“今日听过的歌单”。

## 我现在自己怎么启动

### 开发模式

这个仓库额外提供了一个开发启动脚本：

```bash
./start-dev.sh
```

它会：

- 杀掉旧的前端、后端和重复 Agent
- 用当前 worktree 的代码启动前后端
- 使用真实数据库路径启动后端
- 启动 macOS Agent
- 前端跑在 `http://localhost:3001`

### 原项目的一键启动脚本

仓库里也保留了原本的：

```bash
./start.sh
```

它更偏向初次本地跑通项目。

### 手动启动

后端：

```bash
cd packages/backend
bun install
HASH_SECRET=你的值 DEVICE_TOKEN_1=你的值 bun run src/index.ts
```

前端：

```bash
cd packages/frontend
bun install
NEXT_PUBLIC_API_BASE=http://localhost:3000 PORT=3001 bun run dev
```

macOS Agent：

```bash
cd agents/macos
python3 agent.py
```

## Zeabur 部署

如果你是买了 Zeabur 服务器，想把它变成一个可以公开访问的网址，实际部署方式是：

- Zeabur 上部署这个仓库里的后端和前端
- 你自己的电脑持续运行 macOS Agent
- Agent 把你的活动上报到 Zeabur 上的服务
- 网址展示的就是你电脑实时上报的数据

### 部署步骤

1. 把当前代码推到你自己的 GitHub 仓库
2. 在 Zeabur 里选择从 GitHub 部署
3. 直接使用仓库根目录的 `Dockerfile`
4. 给服务挂一个持久化卷，挂载到 `/data`
5. 配置环境变量
6. 部署完成后，把本机 `agents/macos/config.json` 的 `server_url` 改成 Zeabur 域名

### Zeabur 环境变量

至少需要：

```env
HASH_SECRET=替换成 openssl rand -hex 32 生成的值
DEVICE_TOKEN_1=替换成 你的token:my-mac:My Mac:macos
DB_PATH=/data/live-dashboard.db
STATIC_DIR=/app/public
PORT=3000
```

### 本机 Agent 配置

部署完成后，把本机 `agents/macos/config.json` 改成：

```json
{
  "server_url": "https://你的-zeabur-域名",
  "token": "上面 DEVICE_TOKEN_1 里的 token 部分",
  "interval_seconds": 5,
  "heartbeat_seconds": 60
}
```

然后在你自己的电脑上启动：

```bash
cd agents/macos
python3 agent.py
```

只要 Agent 持续运行，Zeabur 上的网址就会持续更新。

## 环境变量

后端主要依赖这些变量：

- `HASH_SECRET`
  标题哈希用
- `DEVICE_TOKEN_1`
  设备令牌，格式是 `token:device_id:device_name:platform`
- `DB_PATH`
  SQLite 数据库路径
- `PORT`
  后端端口，默认 `3000`

## 为什么我要特别改 macOS 音乐识别

当前 macOS 侧对 QQ 音乐的处理是：

- 前台窗口活动仍然通过 AppleScript 获取
- 后台音乐通过 `media-control get` 获取
- 只认 `bundleIdentifier == com.tencent.QQMusicMac`

所以：

- QQ 音乐在后台播放时，音乐喵也能显示
- 今日音乐合集也会记录

## 现在前端交互和原版本最不一样的地方

### 浏览器历史

- 连续多条同标题网页会合并
- 点开可以看每次具体时间
- 顶部会展示最常读的前三网页

### 当前任务

- 取最近 15 分钟内的活动
- 按应用归并
- 用戏剧化文案显示“现在在干什么”

### 其他时段任务

- 横轴是 0 到 24 点
- 每小时一列
- 每列 6 个格子
- 每格代表 10 分钟
- 可以拖动选择一段时间
- 也可以手动输入开始和结束时间

## 当前已知情况

- 前端开发模式下，`next dev --turbopack` 偶尔会把 `.next` 跑坏，表现为 `500 Internal Server Error`
- 这不是业务代码错误，重启前端 dev 服务即可恢复
- 如果同时跑了多个旧的 macOS Agent，可能互相覆盖状态，尤其会把音乐状态冲掉

## 后续还可以继续改的方向

- 时间轴颜色改成按活动类别固定映射，而不是按应用轮转
- 时间段概览做成更自然的一句话总结
- 浏览器历史加更稳定的网页归类
- 补充更正式的部署文档
