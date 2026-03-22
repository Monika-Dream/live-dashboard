package com.monika.dashboard.ui.screens

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.widget.Toast
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.repeatOnLifecycle
import com.monika.dashboard.data.DebugLog
import com.monika.dashboard.health.HealthConnectManager
import com.monika.dashboard.ui.theme.Border
import com.monika.dashboard.ui.theme.TextMuted
import java.util.Locale

@Composable
fun StatusScreen() {
    val context = LocalContext.current
    val scrollState = rememberScrollState()
    val lifecycleOwner = LocalLifecycleOwner.current

    var healthAvailable by remember { mutableStateOf(false) }

    LaunchedEffect(lifecycleOwner) {
        lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            healthAvailable = HealthConnectManager.isAvailable(context)
        }
    }

    // Tick for refreshing debug log and permission states
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

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // --- Permission & service checks ---
        Text(text = "权限状态", style = MaterialTheme.typography.titleMedium)

        ServiceStatusRow("Health Connect", healthAvailable) {
            try {
                context.startActivity(
                    Intent("android.health.connect.action.HEALTH_HOME_SETTINGS").apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                )
            } catch (_: Exception) {
                Toast.makeText(context, "请安装 Health Connect 应用", Toast.LENGTH_SHORT).show()
            }
        }

        ServiceStatusRow("电池优化已忽略", batteryOptimized) {
            try {
                context.startActivity(
                    Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                        data = Uri.parse("package:${context.packageName}")
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                )
            } catch (e: Exception) {
                DebugLog.log("设置", "电池优化直接请求失败: ${e.message}")
                try {
                    context.startActivity(
                        Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        }
                    )
                } catch (e2: Exception) {
                    DebugLog.log("设置", "电池优化设置页也无法打开: ${e2.message}")
                    Toast.makeText(context, "无法打开电池优化设置", Toast.LENGTH_SHORT).show()
                }
            }
        }

        // Notification permission (Android 13+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val notifPermGranted = remember(tick) {
                context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) ==
                    android.content.pm.PackageManager.PERMISSION_GRANTED
            }
            ServiceStatusRow("通知权限", notifPermGranted) {
                try {
                    context.startActivity(
                        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                            putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        }
                    )
                } catch (e: Exception) {
                    DebugLog.log("设置", "无法打开通知设置: ${e.message}")
                    Toast.makeText(context, "无法打开通知设置", Toast.LENGTH_SHORT).show()
                }
            }
        }

        // Xiaomi/Redmi autostart
        val manufacturer = remember { Build.MANUFACTURER.lowercase(Locale.ROOT) }
        if (manufacturer.contains("xiaomi") || manufacturer.contains("redmi")) {
            ServiceStatusRow("自启动权限") {
                try {
                    context.startActivity(
                        Intent().apply {
                            component = android.content.ComponentName(
                                "com.miui.securitycenter",
                                "com.miui.permcenter.autostart.AutoStartManagementActivity"
                            )
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        }
                    )
                } catch (_: Exception) {
                    try {
                        context.startActivity(
                            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                                data = Uri.parse("package:${context.packageName}")
                                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            }
                        )
                    } catch (e2: Exception) {
                        DebugLog.log("设置", "无法打开自启动设置: ${e2.message}")
                        Toast.makeText(context, "请手动前往 设置→应用→自启动管理", Toast.LENGTH_LONG).show()
                    }
                }
            }
        }

        // OEM-specific guidance
        val oemTip = when {
            manufacturer.contains("xiaomi") || manufacturer.contains("redmi") ->
                "小米/Redmi：设置 → 应用设置 → 应用管理 → Live Dashboard → 省电策略 → 无限制，并开启「自启动」"
            manufacturer.contains("huawei") || manufacturer.contains("honor") ->
                "华为/荣耀：设置 → 电池 → 启动管理 → Live Dashboard → 手动管理 → 三个开关全部打开"
            manufacturer.contains("samsung") ->
                "三星：设置 → 电池 → 后台使用限制 → 从「深度睡眠」列表中移除 Live Dashboard"
            manufacturer.contains("oppo") || manufacturer.contains("realme") || manufacturer.contains("oneplus") ->
                "OPPO/Realme/一加：设置 → 电池 → 更多电池设置 → 关闭「智能功耗管理」，并在应用管理中允许后台运行和自启动"
            manufacturer.contains("vivo") ->
                "vivo：设置 → 电池 → 后台功耗管理 → Live Dashboard → 允许后台高耗电"
            else -> null
        }
        if (oemTip != null) {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(8.dp),
                color = MaterialTheme.colorScheme.tertiaryContainer
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Text(
                        text = "厂商特殊设置",
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onTertiaryContainer
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = oemTip,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onTertiaryContainer
                    )
                }
            }
        }

        Divider(color = Border, thickness = 1.dp)

        // Debug log
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

@Composable
private fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.weight(0.3f)
        )
        Text(
            text = value,
            style = MaterialTheme.typography.labelLarge,
            modifier = Modifier.weight(0.7f)
        )
    }
}

/** Status row with check/cross and optional fix button */
@Composable
private fun ServiceStatusRow(label: String, ok: Boolean, onFix: () -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        color = if (ok) MaterialTheme.colorScheme.secondaryContainer
                else MaterialTheme.colorScheme.errorContainer
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = if (ok) "✓" else "✗",
                    style = MaterialTheme.typography.titleMedium,
                    color = if (ok) MaterialTheme.colorScheme.onSecondaryContainer
                            else MaterialTheme.colorScheme.onErrorContainer
                )
                Text(
                    text = label,
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (ok) MaterialTheme.colorScheme.onSecondaryContainer
                            else MaterialTheme.colorScheme.onErrorContainer
                )
            }
            if (!ok) {
                TextButton(onClick = onFix) {
                    Text("去设置")
                }
            }
        }
    }
}

/** Status row without status check (manual verification needed, e.g. Xiaomi autostart) */
@Composable
private fun ServiceStatusRow(label: String, onAction: () -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        color = MaterialTheme.colorScheme.surfaceVariant
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "$label（请确认已开启）",
                style = MaterialTheme.typography.bodyMedium
            )
            TextButton(onClick = onAction) {
                Text("去设置")
            }
        }
    }
}
