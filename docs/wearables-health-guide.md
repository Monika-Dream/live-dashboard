# 手环 / 手表健康数据接入指南

本项目的健康数据架构：**Health Connect 是手机上唯一的数据枢纽**。我们的 Android App 只从 Health Connect 读数据再上报，不对接任何厂商私有云——所以「你的手环能不能用」这个问题，等价于「你的手环数据能不能进 Health Connect」。

```
手环/手表 → 厂商 App → Health Connect → Live Dashboard App → 你的服务器
```

## 各品牌兼容性一览

| 设备 | 路径 | 状态 |
|------|------|------|
| WearOS 手表（Pixel Watch、小米 Watch 2 Pro 等） | 厂商 App 原生写入 Health Connect | ✅ 直接可用（社区实测通过） |
| Fitbit | Fitbit App → Health Connect | ✅ 直接可用 |
| Zepp / Amazfit | Zepp App → Health Connect | ✅ 直接可用 |
| 三星 Galaxy Watch（国际版） | 三星健康 → Health Connect | ✅ 直接可用（国行三星健康未对接） |
| 小米/红米手环、红米手表（小米运动健康） | 小米运动健康内开启 Health Connect 连接 | ⚠️ 部分可用，见下方说明 |
| 华为手环/手表 | 华为运动健康**不支持** Health Connect | ❌ 需桥接，见下方说明 |
| vivo / iQOO 手环手表 | vivo 健康**不支持** Health Connect | ❌ 同华为，见下方说明 |
| OPPO / 一加手环手表 | 欢太健康（HeyTap Health）**不支持** Health Connect | ❌ 同华为，见下方说明 |
| Apple Watch / iPhone | 无 Health Connect，走 Health Auto Export 直传 | ✅ 走另一条路，见下方说明 |
| Gadgetbridge 支持的设备 | Gadgetbridge 替代官方 App | ⚠️ 极客向，适配见其官网 |

## 小米手环 / 红米手表用户须知

小米运动健康（Mi Fitness）已支持 Health Connect，但有两个坑：

1. **开启路径**：小米运动健康 → 我的 → 第三方数据共享（或 Google Fit 条目内）→ Connect to Health Connect → 全部允许。
2. **重启掉线坑**：手机重启后，小米运动健康与 Health Connect 的连接**可能会静默断开**，需要重新进入上述页面允许一次。如果面板突然没有健康数据了，先检查这里。
3. **数据类型限制**：睡眠、步数、血氧同步稳定；**日常心率目前不会同步**（小米自身限制，非本项目问题）。运动记录只同步手动开始/结束的锻炼。

## 华为手环 / 手表用户须知

华为运动健康生态封闭，不写入 Health Connect，没有直连路径。两个绕法：

- **推荐：[Health Sync](https://healthsync.app/)**（第三方桥接 App，小额付费）：读取华为健康云数据 → 写入 Health Connect，之后与普通设备无异。注意华为 Health Kit 有账号地区限制，参见 Health Sync 官网 FAQ 的华为条目。
- **极客向：[Gadgetbridge](https://gadgetbridge.org/)** 完全替代华为运动健康直连手环（丢失官方 App 功能，普通用户不推荐）。

本项目**不会**直接对接华为 Health Kit 云 API（需要开发者资质审批、账号地区限制多，维护成本远超收益）。

## vivo / iQOO、OPPO / 一加用户须知

vivo 健康、欢太健康与华为一样生态封闭，**不写入 Health Connect**——所以即使你在本 App 里授权了全部
Health Connect 权限，读到的也是空的（数据都在厂商 App 自己手里，Health Connect 里本来就没有）。

- 绕法同华为：[Health Sync](https://healthsync.app/) 桥接（装前先在其官网确认支持你的设备型号）或
  [Gadgetbridge](https://gadgetbridge.org/)（极客向）。
- 快速自检"到底是谁的问题"：打开系统的 Health Connect 页面（设置里搜"Health Connect"）→ 数据和访问权限
  → 看有没有任何 App 在**写入**数据。如果写入列表是空的，说明没有数据源，装什么面板都读不到。

## iPhone / Apple Watch 用户（无需安装本项目 App）

iOS 没有 Health Connect，但可以用 App Store 的 **Health Auto Export** 把 Apple 健康数据定时 POST 到本项目后端：

1. App Store 安装「Health Auto Export — JSON+CSV」
2. 新建 Automation：类型 REST API，格式 JSON
   - URL：`https://你的域名/api/health-webhook`
   - Headers：`Authorization: Bearer 你的DEVICE_TOKEN`
   - 勾选要导出的指标，建议同步周期 15–60 分钟
3. 服务端会自动识别 Health Auto Export 格式并入库

支持的指标映射：心率 / 静息心率 / HRV / 步数 / 距离 / 活动能量 / 血氧 / 呼吸率 / 体温 / 血压 / 血糖 / 体重 / 饮水 / 睡眠（其余指标静默跳过）。单位自动换算（kJ→kcal、km→m、lb→kg、L→mL）。

另一条通用路径：安卓机上任何能写 Health Connect 的数据源，也可以用 [health-connect-webhook](https://github.com/mcnaveen/health-connect-webhook) 直接推给同一个 `/api/health-webhook` 端点（两种格式都能自动识别）。

## 故障排查：「授权了但面板没有数据」

按顺序检查（90% 的问题出在第 1 步）：

1. **数据进 Health Connect 了吗？** 打开系统的 Health Connect（设置 → 健康数据同步）→ 数据和访问权限 → 看对应类型里有没有厂商 App 写入的数据。没有 = 厂商 App 没同步进来，回去检查厂商 App 的 Health Connect 连接开关（小米用户重点看"重启掉线坑"）。
2. **我们的 App 拿到读权限了吗？** App 健康页 → 授权按钮走一遍；注意必须通过 App 内按钮授权，直接在 Health Connect 设置里勾选可能不生效。
3. **同步跑过了吗？** App 状态页看调试日志，有"读取完成 N 条 / 已同步 N 条"字样即正常；点健康页"全量同步"可强制拉取近 7 天。
4. 还不行 → 提 issue 时把状态页调试日志截图带上。
