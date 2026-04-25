# Android Agent（先同意，后上报）

这个 Android 应用是 Live Dashboard 的非 root 客户端。
只有在用户明确同意后，才会上报所选设备的活动信息。

## 可上报内容

- 当前前台应用的包名和应用名
- 电量百分比与充电状态（可选）
- 网络类型（作为上下文元数据）

## 不会做的事情

- 不要求 root 权限
- 不做按键记录
- 不提取其他应用的消息或内容
- 不会在未启用的情况下偷偷自启动

## 需要的权限

- 使用情况访问权限（PACKAGE_USAGE_STATS），用于检测前台应用
- 前台服务权限，用于持续心跳上报
- 网络权限，用于调用 API 上报
- Android 13 及以上的通知权限

## 使用到的后端接口

- POST /api/consent
- POST /api/report

该应用兼容强制同意模式：

- 如果服务端设置 REQUIRE_EXPLICIT_CONSENT=true，会先上传同意状态，再上报活动数据。

## 本地构建

在 Android Studio 中打开以下目录：

- packages/android-agent

然后执行：

1. 同步 Gradle 项目。
2. 在 app 模块构建 release APK。
3. 输出路径为：
   - app/build/outputs/apk/release/app-release.apk

## 运行配置

1. 填写服务端 URL 和 token。
2. 授予使用情况访问权限。
3. 勾选并确认同意项。
4. 保存设置并启动追踪。
