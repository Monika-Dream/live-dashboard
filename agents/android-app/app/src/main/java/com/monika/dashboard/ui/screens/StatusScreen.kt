/*
 * 状态页：权限体检中心（应用识别 / 后台保活 / 音乐识别 / 健康数据 四组）+ DebugLog 实时查看。
 * 所有权限申请入口统一收敛在本页（SetupScreen 只留服务器配置），
 * 顶部总览卡实时统计可检测项的就绪数，未就绪项行内直达对应系统设置页。
 * 联动：权限检测复用 CurrentAppDetector / MusicMetadataProvider / HealthConnectManager。
 */
package com.monika.dashboard.ui.screens

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.repeatOnLifecycle
import com.monika.dashboard.data.DebugLog
import com.monika.dashboard.data.SettingsStore
import com.monika.dashboard.health.BackgroundReadAvailability
import com.monika.dashboard.health.HealthConnectManager
import com.monika.dashboard.monitor.CurrentAppDetector
import com.monika.dashboard.monitor.MusicMetadataProvider
import com.monika.dashboard.ui.theme.Border
import com.monika.dashboard.ui.theme.Card
import com.monika.dashboard.ui.theme.Primary
import com.monika.dashboard.ui.theme.SakuraBg
import com.monika.dashboard.ui.theme.TextMuted
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.coroutines.cancellation.CancellationException
import java.util.Locale

// 权限行状态色：不用大块红绿底色轰炸，只用小圆点点缀
private val StatusOk = Color(0xFF6FBF8E)
private val StatusBad = Color(0xFFE07A7A)
private val StatusWarn = Color(0xFFE8B86D)

private enum class PermState { GRANTED, MISSING, MANUAL }

@Composable
fun StatusScreen(settings: SettingsStore) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val scrollState = rememberScrollState()
    val lifecycleOwner = LocalLifecycleOwner.current

    var healthAvailable by remember { mutableStateOf(false) }
    var backgroundReadAvailability by remember { mutableStateOf<BackgroundReadAvailability?>(null) }
    var bgPermGranted by remember { mutableStateOf(false) }
    var usageAccessGranted by remember { mutableStateOf(false) }
    var accessibilityAccessGranted by remember { mutableStateOf(false) }
    var notificationAccessGranted by remember { mutableStateOf(false) }
    val hcManager = remember(context) { HealthConnectManager(context.applicationContext) }
    val currentAppDetector = remember(context) { CurrentAppDetector(context.applicationContext) }
    val musicProvider = remember(context) { MusicMetadataProvider(context.applicationContext) }

    LaunchedEffect(lifecycleOwner) {
        lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            usageAccessGranted = currentAppDetector.hasUsageAccess()
            accessibilityAccessGranted = currentAppDetector.hasAccessibilityAccess()
            notificationAccessGranted = musicProvider.hasNotificationAccess()
            healthAvailable = HealthConnectManager.isAvailable(context)
            if (healthAvailable) {
                val (availability, permGranted) = withContext(Dispatchers.IO) {
                    val availability = try {
                        hcManager.getBackgroundReadAvailability()
                    } catch (e: CancellationException) { throw e
                    } catch (e: Exception) {
                        BackgroundReadAvailability(false, errorMessage = e.message ?: e.javaClass.simpleName)
                    }
                    val granted = try {
                        hcManager.getGrantedPermissions()
                    } catch (e: CancellationException) { throw e
                    } catch (_: Exception) { emptySet() }
                    Pair(availability, hcManager.backgroundReadPermission in granted)
                }
                backgroundReadAvailability = availability
                bgPermGranted = permGranted
            } else {
                backgroundReadAvailability = null
                bgPermGranted = false
            }
        }
    }

    // 定时刷新调试日志和权限状态，避免用户授权后必须手动重进页面。
    var tick by remember { mutableIntStateOf(0) }
    LaunchedEffect(Unit) {
        while (true) {
            kotlinx.coroutines.delay(3000)
            tick++
        }
    }

    val pm = remember { context.getSystemService(android.content.Context.POWER_SERVICE) as? PowerManager }
    var batteryOptimized by remember {
        mutableStateOf(pm?.isIgnoringBatteryOptimizations(context.packageName) == true)
    }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                batteryOptimized = pm?.isIgnoringBatteryOptimizations(context.packageName) == true
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    val isTiramisu = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
    val notifPermGranted = if (isTiramisu) {
        remember(tick) {
            context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) ==
                android.content.pm.PackageManager.PERMISSION_GRANTED
        }
    } else true
    val manufacturer = remember { Build.MANUFACTURER.lowercase(Locale.ROOT) }
    val isMiui = manufacturer.contains("xiaomi") || manufacturer.contains("redmi")

    // 总览只统计能自动检测的项；小米自启动/省电策略无法探测，不计入
    val checkable = buildList {
        add(accessibilityAccessGranted)
        add(usageAccessGranted)
        add(batteryOptimized)
        if (isTiramisu) add(notifPermGranted)
        add(notificationAccessGranted)
        add(healthAvailable)
    }
    val readyCount = checkable.count { it }
    val totalCount = checkable.size

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // --- 总览 ---
        SummaryCard(ready = readyCount, total = totalCount, hasManualItems = isMiui)

        // --- 应用识别 ---
        PermissionGroupCard(
            title = "应用识别",
            subtitle = "识别你正在用哪个应用，是整个面板的核心数据源",
            footer = "两条通道任开其一即可工作；无障碍是主通道（切换应用瞬间上报），" +
                "使用情况访问是兜底通道（后台轮询，延迟更高）。建议两个都开。"
        ) {
            PermissionRow(
                title = "无障碍服务",
                subtitle = "主通道 · 切换应用即时上报，最抗后台冻结",
                state = if (accessibilityAccessGranted) PermState.GRANTED else PermState.MISSING
            ) {
                openSafely(context, "无障碍设置") { CurrentAppDetector.accessibilitySettingsIntent() }
            }
            RowDivider()
            PermissionRow(
                title = "使用情况访问",
                subtitle = "兜底通道 · 无障碍不可用时接管识别",
                state = if (usageAccessGranted) PermState.GRANTED else PermState.MISSING
            ) {
                openSafely(context, "使用情况访问页") { CurrentAppDetector.usageAccessSettingsIntent() }
            }
        }

        // --- 后台保活 ---
        PermissionGroupCard(
            title = "后台保活",
            subtitle = "让心跳循环在后台活下来，缺一项都可能被系统冻结",
            footer = when {
                manufacturer.contains("huawei") || manufacturer.contains("honor") ->
                    "华为/荣耀：设置 → 电池 → 启动管理 → Live Dashboard → 手动管理 → 三个开关全部打开"
                manufacturer.contains("samsung") ->
                    "三星：设置 → 电池 → 后台使用限制 → 从「深度睡眠」列表中移除 Live Dashboard"
                manufacturer.contains("oppo") || manufacturer.contains("realme") || manufacturer.contains("oneplus") ->
                    "OPPO/Realme/一加：设置 → 电池 → 关闭「智能功耗管理」，并允许后台运行和自启动"
                manufacturer.contains("vivo") ->
                    "vivo：设置 → 电池 → 后台功耗管理 → Live Dashboard → 允许后台高耗电"
                else -> null
            }
        ) {
            PermissionRow(
                title = "忽略电池优化",
                subtitle = "AOSP 层白名单 · 减少系统休眠限制",
                state = if (batteryOptimized) PermState.GRANTED else PermState.MISSING
            ) {
                try {
                    context.startActivity(
                        Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                            data = Uri.parse("package:${context.packageName}")
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        }
                    )
                } catch (e: Exception) {
                    DebugLog.log("设置", "电池优化直接请求失败: ${e.message}")
                    openSafely(context, "电池优化设置") {
                        Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        }
                    }
                }
            }
            if (isTiramisu) {
                RowDivider()
                PermissionRow(
                    title = "通知权限",
                    subtitle = "显示前台服务常驻通知，降低被杀优先级",
                    state = if (notifPermGranted) PermState.GRANTED else PermState.MISSING
                ) {
                    openSafely(context, "通知设置") {
                        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                            putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        }
                    }
                }
            }
            // 厂商私有保活开关：按 Build.MANUFACTURER 只渲染当前设备厂商的直达行，
            // 小米看不到华为的、华为看不到 OPPO 的——其他厂商的机器上这些行根本不存在
            val vendorSettings = remember(manufacturer) { vendorKeepAliveSettings(manufacturer) }
            vendorSettings.forEach { setting ->
                RowDivider()
                PermissionRow(
                    title = setting.title,
                    subtitle = setting.subtitle,
                    state = PermState.MANUAL
                ) {
                    openVendorSetting(context, setting)
                }
            }
            if (isMiui) {
                RowDivider()
                PermissionRow(
                    title = "省电策略 → 无限制",
                    subtitle = "MIUI 冻结后台的真正闸门，务必设为「无限制」",
                    state = PermState.MANUAL
                ) {
                    openMiuiBatterySaver(context)
                }
            }
            RowDivider()
            // #45：从最近任务隐藏——保活全开也挡不住自己顺手划卡，干脆让卡片不出现
            val hideFromRecents by settings.hideFromRecents.collectAsState(initial = false)
            ToggleRow(
                title = "从最近任务隐藏",
                subtitle = if (hideFromRecents)
                    "已隐藏 · 划卡划不到本应用了，回到 App 请从桌面图标进"
                else
                    "防止顺手划卡误杀进程；开启后最近任务里不再出现本应用",
                checked = hideFromRecents
            ) { checked ->
                scope.launch { settings.setHideFromRecents(checked) }
            }
        }

        // --- 音乐识别（可选）---
        PermissionGroupCard(
            title = "音乐识别",
            badge = "可选",
            subtitle = "读取播放器通知里的歌名 / 歌手，展示「正在听」状态"
        ) {
            PermissionRow(
                title = "通知访问",
                subtitle = "只读取媒体通知，不碰其他通知内容",
                state = if (notificationAccessGranted) PermState.GRANTED else PermState.MISSING
            ) {
                openSafely(context, "通知访问设置") { MusicMetadataProvider.notificationListenerSettingsIntent() }
            }
        }

        // --- 健康数据（可选）---
        PermissionGroupCard(
            title = "健康数据",
            badge = "可选",
            subtitle = "经 Health Connect 同步手环 / 手表数据，具体授权在「健康」页",
            footer = "授权了却没有数据？多半是手环 App 没把数据写进 Health Connect：" +
                "去手环 App（如小米运动健康）里检查 Health Connect 连接开关——" +
                "小米手机重启后该连接可能静默断开，需要重新允许一次。"
        ) {
            PermissionRow(
                title = "Health Connect",
                subtitle = "系统健康数据枢纽，需要单独安装 / 启用",
                state = if (healthAvailable) PermState.GRANTED else PermState.MISSING
            ) {
                openSafely(context, "Health Connect", toast = "请安装 Health Connect 应用") {
                    Intent("android.health.connect.action.HEALTH_HOME_SETTINGS").apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                }
            }
            if (healthAvailable) {
                RowDivider()
                BackgroundHealthRow(
                    hcManager = hcManager,
                    availability = backgroundReadAvailability,
                    bgPermGranted = bgPermGranted,
                    context = context
                )
            }
        }

        Divider(color = Border, thickness = 1.dp)

        // --- 调试日志 ---
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(text = "调试日志", style = MaterialTheme.typography.titleMedium)
            TextButton(onClick = { DebugLog.clear() }) {
                Text("清空", style = MaterialTheme.typography.bodySmall)
            }
        }

        val logLines = remember(tick) { DebugLog.lines }
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 100.dp, max = 300.dp)
                .border(1.dp, Border, RoundedCornerShape(8.dp)),
            shape = RoundedCornerShape(8.dp)
        ) {
            if (logLines.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "暂无日志",
                        style = MaterialTheme.typography.bodySmall,
                        color = TextMuted
                    )
                }
            } else {
                val logScrollState = rememberScrollState()
                Column(
                    modifier = Modifier
                        .padding(8.dp)
                        .verticalScroll(logScrollState)
                ) {
                    logLines.forEach { line ->
                        Text(
                            text = line,
                            style = MaterialTheme.typography.bodySmall,
                            color = TextMuted,
                            modifier = Modifier.padding(vertical = 1.dp)
                        )
                    }
                }
            }
        }
    }
}

/* ---------- 组件 ---------- */

/** 顶部总览：就绪计数 + 一句话状态。 */
@Composable
private fun SummaryCard(ready: Int, total: Int, hasManualItems: Boolean) {
    val allReady = ready >= total
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        color = SakuraBg,
        border = androidx.compose.foundation.BorderStroke(1.dp, Primary.copy(alpha = 0.35f))
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Text(
                text = "$ready/$total",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = if (allReady) StatusOk else Primary
            )
            Column {
                Text(
                    text = if (allReady) "权限体检全部通过" else "还有 ${total - ready} 项待开启",
                    style = MaterialTheme.typography.titleMedium
                )
                Text(
                    text = when {
                        allReady && hasManualItems -> "自动检测项已就绪；自启动和省电策略请确认已手动设置过"
                        allReady -> "全部就绪，可以放心挂机了"
                        else -> "点下方各项的「去开启」逐个补齐"
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = TextMuted
                )
            }
        }
    }
}

/** 分组卡片：组头（标题 + 可选徽标 + 说明）+ 权限行 + 可选脚注。 */
@Composable
private fun PermissionGroupCard(
    title: String,
    subtitle: String,
    badge: String? = null,
    footer: String? = null,
    content: @Composable ColumnScope.() -> Unit
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        color = Card,
        border = androidx.compose.foundation.BorderStroke(1.dp, Border)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold
                )
                if (badge != null) {
                    Surface(
                        shape = RoundedCornerShape(999.dp),
                        color = SakuraBg,
                        border = androidx.compose.foundation.BorderStroke(1.dp, Border)
                    ) {
                        Text(
                            text = badge,
                            style = MaterialTheme.typography.bodySmall,
                            color = TextMuted,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
                        )
                    }
                }
            }
            Spacer(modifier = Modifier.height(2.dp))
            Text(text = subtitle, style = MaterialTheme.typography.bodySmall, color = TextMuted)
            Spacer(modifier = Modifier.height(10.dp))
            content()
            if (footer != null) {
                Spacer(modifier = Modifier.height(10.dp))
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp),
                    color = SakuraBg
                ) {
                    Text(
                        text = footer,
                        style = MaterialTheme.typography.bodySmall,
                        color = TextMuted,
                        modifier = Modifier.padding(10.dp)
                    )
                }
            }
        }
    }
}

/** 单条权限行：状态点 + 标题/说明 + 按需展示的操作按钮。 */
@Composable
private fun PermissionRow(
    title: String,
    subtitle: String,
    state: PermState,
    onFix: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Box(
            modifier = Modifier
                .size(10.dp)
                .background(
                    color = when (state) {
                        PermState.GRANTED -> StatusOk
                        PermState.MISSING -> StatusBad
                        PermState.MANUAL -> StatusWarn
                    },
                    shape = CircleShape
                )
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(text = title, style = MaterialTheme.typography.bodyMedium)
            Text(text = subtitle, style = MaterialTheme.typography.bodySmall, color = TextMuted)
        }
        when (state) {
            PermState.GRANTED -> Text(
                text = "已开启",
                style = MaterialTheme.typography.bodySmall,
                color = StatusOk
            )
            PermState.MISSING -> TextButton(onClick = onFix, contentPadding = PaddingValues(horizontal = 10.dp)) {
                Text("去开启")
            }
            PermState.MANUAL -> TextButton(onClick = onFix, contentPadding = PaddingValues(horizontal = 10.dp)) {
                Text("去设置")
            }
        }
    }
}

@Composable
private fun RowDivider() {
    Divider(color = Border.copy(alpha = 0.5f), thickness = 1.dp)
}

/** 功能开关行：与 PermissionRow 同构（状态点 + 标题/说明），右侧换成 Switch。 */
@Composable
private fun ToggleRow(
    title: String,
    subtitle: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Box(
            modifier = Modifier
                .size(10.dp)
                .background(
                    color = if (checked) StatusOk else TextMuted.copy(alpha = 0.4f),
                    shape = CircleShape
                )
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(text = title, style = MaterialTheme.typography.bodyMedium)
            Text(text = subtitle, style = MaterialTheme.typography.bodySmall, color = TextMuted)
        }
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            colors = SwitchDefaults.colors(checkedTrackColor = Primary)
        )
    }
}

/** 后台健康同步状态（保留原判定逻辑，收进健康分组卡内展示）。 */
@Composable
private fun BackgroundHealthRow(
    hcManager: HealthConnectManager,
    availability: BackgroundReadAvailability?,
    bgPermGranted: Boolean,
    context: android.content.Context
) {
    val needsBgPerm = hcManager.needsBackgroundPermission
    val bgFeatureAvailable = availability?.isAvailable == true
    val bgFeatureCheckFailed = !availability?.errorMessage.isNullOrEmpty()
    val bgEnabled = bgPermGranted && bgFeatureAvailable
    val bgUnavailable = needsBgPerm && !bgFeatureAvailable && !bgFeatureCheckFailed

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Box(
            modifier = Modifier
                .size(10.dp)
                .background(
                    color = when {
                        !needsBgPerm || bgEnabled -> StatusOk
                        bgUnavailable || bgFeatureCheckFailed -> StatusWarn
                        else -> StatusBad
                    },
                    shape = CircleShape
                )
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(text = "后台健康同步", style = MaterialTheme.typography.bodyMedium)
            Text(
                text = when {
                    !needsBgPerm -> "系统无需额外后台读取权限，可直接同步"
                    bgEnabled -> "已授权后台读取，将按设定间隔自动同步"
                    bgFeatureCheckFailed -> "后台读取能力检测失败：${availability?.errorMessage ?: "未知错误"}；可先尝试授权"
                    bgUnavailable -> "当前设备 / Health Connect 版本未开放后台读取；打开 APP 时会自动同步当天数据"
                    else -> "后台读取未授权；当前仅在打开 APP 时同步当天数据"
                },
                style = MaterialTheme.typography.bodySmall,
                color = TextMuted
            )
        }
        // 只有设备支持且还没授权时，才展示"去授权"入口。
        if (needsBgPerm && !bgPermGranted && (bgFeatureAvailable || bgFeatureCheckFailed)) {
            TextButton(
                onClick = {
                    try {
                        context.startActivity(
                            Intent("android.health.connect.action.MANAGE_HEALTH_PERMISSIONS").apply {
                                putExtra("android.intent.extra.PACKAGE_NAME", context.packageName)
                                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            }
                        )
                    } catch (_: Exception) {
                        openSafely(context, "Health Connect 设置") {
                            Intent("android.health.connect.action.HEALTH_HOME_SETTINGS").apply {
                                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            }
                        }
                    }
                },
                contentPadding = PaddingValues(horizontal = 10.dp)
            ) {
                Text("去授权")
            }
        }
    }
}

/* ---------- 厂商私有保活开关 ---------- */

/**
 * 一条厂商专属的保活设置直达项。
 * components 依序尝试（各厂商不同系统版本 Activity 会搬家），全失败退应用详情页。
 * 组件名参考 AutoStarter 开源库（judemanutd/autostarter）与社区整理，属业界事实标准。
 */
private data class VendorSetting(
    val title: String,
    val subtitle: String,
    val components: List<Pair<String, String>>,
    val failHint: String,
)

/** 按厂商返回适用的直达行；原生类系统（Pixel 等）返回空——AOSP 电池优化行已覆盖。 */
private fun vendorKeepAliveSettings(manufacturer: String): List<VendorSetting> = when {
    manufacturer.contains("xiaomi") || manufacturer.contains("redmi") -> listOf(
        VendorSetting(
            title = "自启动",
            subtitle = "MIUI 私有开关 · 开机与被杀后允许自动拉起",
            components = listOf(
                "com.miui.securitycenter" to "com.miui.permcenter.autostart.AutoStartManagementActivity",
            ),
            failHint = "请手动前往 设置→应用→自启动管理",
        ),
    )
    manufacturer.contains("honor") -> listOf(
        VendorSetting(
            title = "应用启动管理",
            subtitle = "Magic OS · 设为手动管理并打开全部三个开关",
            components = listOf(
                "com.hihonor.systemmanager" to "com.hihonor.systemmanager.startupmgr.ui.StartupNormalAppListActivity",
                "com.huawei.systemmanager" to "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity",
            ),
            failHint = "请手动前往 设置→应用启动管理→Live Dashboard→手动管理",
        ),
    )
    manufacturer.contains("huawei") -> listOf(
        VendorSetting(
            title = "应用启动管理",
            subtitle = "EMUI/鸿蒙的后台闸门 · 设为手动管理并打开全部三个开关",
            components = listOf(
                "com.huawei.systemmanager" to "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity",
                "com.huawei.systemmanager" to "com.huawei.systemmanager.optimize.process.ProtectActivity",
            ),
            failHint = "请手动前往 设置→应用启动管理→Live Dashboard→手动管理",
        ),
    )
    manufacturer.contains("oppo") || manufacturer.contains("realme") -> listOf(
        VendorSetting(
            title = "自启动管理",
            subtitle = "ColorOS · 允许自启动与后台运行",
            components = listOf(
                "com.coloros.safecenter" to "com.coloros.safecenter.permission.startup.StartupAppListActivity",
                "com.coloros.safecenter" to "com.coloros.safecenter.startupapp.StartupAppListActivity",
                "com.oppo.safe" to "com.oppo.safe.permission.startup.StartupAppListActivity",
            ),
            failHint = "请手动前往 手机管家→权限隐私→自启动管理",
        ),
    )
    manufacturer.contains("oneplus") -> listOf(
        VendorSetting(
            title = "自启动管理",
            subtitle = "一加 · 允许自启动与后台运行",
            components = listOf(
                "com.oneplus.security" to "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity",
                "com.coloros.safecenter" to "com.coloros.safecenter.permission.startup.StartupAppListActivity",
            ),
            failHint = "请手动前往 设置→应用→自启动管理",
        ),
    )
    manufacturer.contains("vivo") || manufacturer.contains("iqoo") -> listOf(
        VendorSetting(
            title = "后台高耗电",
            subtitle = "OriginOS · 允许后台高耗电运行",
            components = listOf(
                "com.vivo.permissionmanager" to "com.vivo.permissionmanager.activity.BgStartUpManagerActivity",
                "com.iqoo.secure" to "com.iqoo.secure.ui.phoneoptimize.BgStartUpManager",
            ),
            failHint = "请手动前往 设置→电池→后台功耗管理",
        ),
    )
    manufacturer.contains("samsung") -> listOf(
        VendorSetting(
            title = "后台使用限制",
            subtitle = "One UI · 别让本应用进入「深度睡眠」列表",
            components = listOf(
                "com.samsung.android.lool" to "com.samsung.android.sm.ui.battery.BatteryActivity",
                "com.samsung.android.lool" to "com.samsung.android.sm.battery.ui.BatteryActivity",
            ),
            failHint = "请手动前往 设置→电池→后台使用限制",
        ),
    )
    else -> emptyList()
}

/** 依序尝试厂商设置页候选组件，全失败退应用详情页。 */
private fun openVendorSetting(context: android.content.Context, setting: VendorSetting) {
    for ((pkg, cls) in setting.components) {
        try {
            context.startActivity(
                Intent().apply {
                    component = android.content.ComponentName(pkg, cls)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            )
            return
        } catch (e: Exception) {
            DebugLog.log("设置", "「${setting.title}」候选 $pkg 打开失败: ${e.message}")
        }
    }
    openAppDetails(context, setting.failHint)
}

/* ---------- 跳转 helper ---------- */

/** 通用安全跳转：Intent 构造 / 启动失败时记日志并 Toast。 */
private fun openSafely(
    context: android.content.Context,
    label: String,
    toast: String? = null,
    intentBuilder: () -> Intent
) {
    try {
        context.startActivity(intentBuilder())
    } catch (e: Exception) {
        DebugLog.log("设置", "无法打开$label: ${e.message}")
        Toast.makeText(context, toast ?: "无法打开$label", Toast.LENGTH_SHORT).show()
    }
}

/** 应用详情页兜底跳转。 */
private fun openAppDetails(context: android.content.Context, failToast: String) {
    try {
        context.startActivity(
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:${context.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
        )
    } catch (e: Exception) {
        DebugLog.log("设置", "应用详情页也无法打开: ${e.message}")
        Toast.makeText(context, failToast, Toast.LENGTH_LONG).show()
    }
}

/**
 * 直达 MIUI/HyperOS 省电策略配置页（HiddenAppsConfigActivity，真机实测可用）。
 * 电池优化白名单（AOSP）≠ 省电策略（MIUI 私有），后者才是后台冻结的真正闸门，
 * 必须设为「无限制」。失败时退应用详情页，再退 Toast 提示手动路径。
 */
private fun openMiuiBatterySaver(context: android.content.Context) {
    try {
        context.startActivity(
            Intent().apply {
                component = android.content.ComponentName(
                    "com.miui.powerkeeper",
                    "com.miui.powerkeeper.ui.HiddenAppsConfigActivity"
                )
                putExtra("package_name", context.packageName)
                putExtra("package_label", "Live Dashboard")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
        )
    } catch (e: Exception) {
        DebugLog.log("设置", "省电策略页打开失败: ${e.message}")
        openAppDetails(context, "请手动前往 设置→应用管理→Live Dashboard→省电策略→无限制")
    }
}
