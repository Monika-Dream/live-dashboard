package com.monika.livedashboard.agent

import android.Manifest
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import java.net.URI

class MainActivity : ComponentActivity() {
    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) {}

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val granted = ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
            if (!granted) {
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }

        val settingsStore = SettingsStore(this)

        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    AgentScreen(settingsStore = settingsStore)
                }
            }
        }
    }
}

@Composable
private fun AgentScreen(settingsStore: SettingsStore) {
    val context = LocalContext.current
    val initial = remember { settingsStore.load() }

    var serverUrl by rememberSaveable { mutableStateOf(initial.serverUrl) }
    var token by rememberSaveable { mutableStateOf(initial.token) }
    var heartbeatText by rememberSaveable { mutableStateOf(initial.heartbeatSeconds.toString()) }

    var consentGiven by rememberSaveable { mutableStateOf(initial.consentGiven) }
    var reportActivity by rememberSaveable { mutableStateOf(initial.reportActivity) }
    var reportBattery by rememberSaveable { mutableStateOf(initial.reportBattery) }
    var autoStartOnBoot by rememberSaveable { mutableStateOf(initial.autoStartOnBoot) }
    var tokenVisible by rememberSaveable { mutableStateOf(false) }
    var runningEnabled by rememberSaveable { mutableStateOf(initial.isRunningEnabled) }
    var customRules by remember { mutableStateOf(initial.customRules) }
    var customRulePackage by rememberSaveable { mutableStateOf("") }
    var customRuleName by rememberSaveable { mutableStateOf("") }
    var customRuleDescription by rememberSaveable { mutableStateOf("") }
    var statusText by rememberSaveable { mutableStateOf("空闲") }
    var logs by remember { mutableStateOf(settingsStore.loadLogs(80)) }

    fun refreshLogs() {
        logs = settingsStore.loadLogs(80)
    }

    val usagePermissionGranted = UsageTracker.hasUsageStatsPermission(context)
    val notificationAccessGranted = hasNotificationAccess(context)
    val batteryOptimizationIgnored = isIgnoringBatteryOptimizations(context)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("实时看板助手", style = MaterialTheme.typography.headlineSmall)
        Text(
            "更稳定地持续上报设备活动，并支持显示听歌状态。",
            style = MaterialTheme.typography.bodyMedium
        )

        HorizontalDivider()

        ElevatedCard(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Text("运行状态", style = MaterialTheme.typography.titleMedium)
                Text(if (runningEnabled) "监听状态：运行中" else "监听状态：未运行")
                Text(if (usagePermissionGranted) "使用情况访问：已授权" else "使用情况访问：未授权")
                Text(if (notificationAccessGranted) "通知读取权限（音乐识别）：已授权" else "通知读取权限（音乐识别）：未授权")
                Text(if (batteryOptimizationIgnored) "电池优化：已加入白名单" else "电池优化：未加入白名单")
                Text("状态：$statusText")
            }
        }

        HorizontalDivider()
        Text("基础配置", style = MaterialTheme.typography.titleMedium)

        OutlinedTextField(
            value = serverUrl,
            onValueChange = { serverUrl = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("服务器地址") },
            singleLine = true,
            placeholder = { Text("http://192.168.1.10:3000 或 https://example.com") }
        )

        OutlinedTextField(
            value = token,
            onValueChange = { token = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Token 密钥") },
            singleLine = true,
            visualTransformation = if (tokenVisible) VisualTransformation.None else PasswordVisualTransformation()
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text("显示密钥")
            Switch(checked = tokenVisible, onCheckedChange = { tokenVisible = it })
        }

        OutlinedTextField(
            value = heartbeatText,
            onValueChange = { heartbeatText = it.filter(Char::isDigit) },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("心跳间隔（秒，10-50）") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
        )

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text("上报前台应用活动")
            Switch(checked = reportActivity, onCheckedChange = { reportActivity = it })
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text("附带电量状态")
            Switch(checked = reportBattery, onCheckedChange = { reportBattery = it })
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text("开机自启")
            Switch(checked = autoStartOnBoot, onCheckedChange = { autoStartOnBoot = it })
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.Start
        ) {
            Checkbox(checked = consentGiven, onCheckedChange = { consentGiven = it })
            Text(
                "我已了解并同意上传所选设备活动数据。",
                modifier = Modifier.padding(top = 12.dp)
            )
        }

        HorizontalDivider()
        Text("应用识别与自定义文案", style = MaterialTheme.typography.titleMedium)

        OutlinedTextField(
            value = customRulePackage,
            onValueChange = { customRulePackage = it.trim() },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("应用包名") },
            singleLine = true,
            placeholder = { Text("如: com.example.app") }
        )

        OutlinedTextField(
            value = customRuleName,
            onValueChange = { customRuleName = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("自定义应用名") },
            singleLine = true,
            placeholder = { Text("如: 我的学习应用") }
        )

        OutlinedTextField(
            value = customRuleDescription,
            onValueChange = { customRuleDescription = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("自定义文案（可选）") },
            singleLine = true,
            placeholder = { Text("如: 正在专注刷题喵~") }
        )

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = {
                val packageName = customRulePackage.trim()
                val customName = customRuleName.trim()
                if (packageName.isBlank() || customName.isBlank()) {
                    statusText = "包名和自定义应用名不能为空。"
                    return@Button
                }

                val normalized = AppCustomRule(
                    packageName = packageName,
                    customAppName = customName,
                    customDescription = customRuleDescription.trim().ifBlank { null },
                )

                customRules = customRules
                    .filterNot { it.packageName.equals(packageName, ignoreCase = true) }
                    .plus(normalized)
                customRulePackage = ""
                customRuleName = ""
                customRuleDescription = ""
                statusText = "自定义规则已添加（记得点保存设置）。"
            }) {
                Text("添加 / 更新规则")
            }
        }

        if (customRules.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                customRules.forEach { rule ->
                    ElevatedCard(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(10.dp)) {
                            Text("包名: ${rule.packageName}", style = MaterialTheme.typography.bodySmall)
                            Text("应用名: ${rule.customAppName}", style = MaterialTheme.typography.bodyMedium)
                            rule.customDescription?.let {
                                Text("文案: $it", style = MaterialTheme.typography.bodySmall)
                            }
                            Button(
                                onClick = {
                                    customRules = customRules.filterNot {
                                        it.packageName.equals(rule.packageName, ignoreCase = true)
                                    }
                                    statusText = "已删除规则（记得点保存设置）。"
                                },
                                modifier = Modifier.padding(top = 6.dp)
                            ) {
                                Text("删除规则")
                            }
                        }
                    }
                }
            }
        }

        HorizontalDivider()
        Text("权限与系统设置", style = MaterialTheme.typography.titleMedium)

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = {
                UsageTracker.openUsageAccessSettings(context)
                statusText = "已打开使用情况访问权限页。"
            }) {
                Text("使用情况权限")
            }

            Button(onClick = {
                openNotificationAccessSettings(context)
                statusText = "已打开通知读取权限页。"
            }) {
                Text("通知读取权限")
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = {
                requestIgnoreBatteryOptimizations(context)
                statusText = "已打开电池优化设置页。"
            }) {
                Text("电池白名单")
            }

            Button(onClick = {
                refreshLogs()
                statusText = "状态已刷新。"
            }) {
                Text("刷新状态")
            }
        }

        HorizontalDivider()
        Text("操作", style = MaterialTheme.typography.titleMedium)

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                onClick = {
                    val heartbeat = heartbeatText.toIntOrNull()?.coerceIn(10, 50) ?: 30
                    val normalizedServer = serverUrl.trim().trimEnd('/')
                    if (!isServerUrlAllowed(normalizedServer)) {
                        statusText = "服务器地址必须是有效的 http:// 或 https:// 地址。"
                        settingsStore.appendLog("保存设置失败：服务器地址不符合要求")
                        refreshLogs()
                        return@Button
                    }
                    if (token.trim().isBlank()) {
                        statusText = "必须填写 Token 密钥。"
                        settingsStore.appendLog("保存设置失败：未填写 Token")
                        refreshLogs()
                        return@Button
                    }

                    settingsStore.save(
                        AgentSettings(
                            serverUrl = normalizedServer,
                            token = token.trim(),
                            heartbeatSeconds = heartbeat,
                            consentGiven = consentGiven,
                            reportActivity = reportActivity,
                            reportBattery = reportBattery,
                            autoStartOnBoot = autoStartOnBoot,
                            isRunningEnabled = runningEnabled,
                            customRules = customRules,
                        )
                    )
                    statusText = "设置已保存。"
                    settingsStore.appendLog("设置已保存")
                    refreshLogs()
                }
            ) {
                Text("保存设置")
            }

            Button(
                onClick = {
                    if (!consentGiven) {
                        statusText = "启动前必须先同意授权。"
                        settingsStore.appendLog("启动失败：未勾选同意")
                        refreshLogs()
                        return@Button
                    }
                    if (!reportActivity) {
                        statusText = "请先开启活动上报。"
                        settingsStore.appendLog("启动失败：活动上报未开启")
                        refreshLogs()
                        return@Button
                    }
                    if (!UsageTracker.hasUsageStatsPermission(context)) {
                        statusText = "请先授予使用情况访问权限。"
                        settingsStore.appendLog("启动失败：未授予使用情况访问权限")
                        refreshLogs()
                        return@Button
                    }

                    val heartbeat = heartbeatText.toIntOrNull()?.coerceIn(10, 50) ?: 30
                    val normalizedServer = serverUrl.trim().trimEnd('/')
                    if (!isServerUrlAllowed(normalizedServer) || token.trim().isBlank()) {
                        statusText = "请填写有效的服务器地址和 Token 密钥。"
                        settingsStore.appendLog("启动失败：服务器地址或 Token 无效")
                        refreshLogs()
                        return@Button
                    }

                    settingsStore.save(
                        AgentSettings(
                            serverUrl = normalizedServer,
                            token = token.trim(),
                            heartbeatSeconds = heartbeat,
                            consentGiven = consentGiven,
                            reportActivity = reportActivity,
                            reportBattery = reportBattery,
                            autoStartOnBoot = autoStartOnBoot,
                            isRunningEnabled = true,
                            customRules = customRules,
                        )
                    )
                    runningEnabled = true

                    val serviceIntent = Intent(context, TrackingService::class.java).apply {
                        action = TrackingService.ACTION_START
                    }
                    ContextCompat.startForegroundService(context, serviceIntent)
                    statusText = "监听已启动。"
                    settingsStore.appendLog("监听已启动")
                    refreshLogs()
                }
            ) {
                Text("开始监听")
            }

            Button(
                onClick = {
                    settingsStore.setRunningEnabled(false)
                    runningEnabled = false
                    val serviceIntent = Intent(context, TrackingService::class.java).apply {
                        action = TrackingService.ACTION_STOP
                    }
                    context.startService(serviceIntent)
                    statusText = "监听已停止。"
                    settingsStore.appendLog("监听已停止")
                    refreshLogs()
                }
            ) {
                Text("停止监听")
            }
        }

        HorizontalDivider()
        Text("运行日志", style = MaterialTheme.typography.titleMedium)

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = {
                refreshLogs()
                statusText = "日志已刷新。"
            }) {
                Text("刷新日志")
            }
            Button(onClick = {
                settingsStore.clearLogs()
                refreshLogs()
                statusText = "日志已清空。"
            }) {
                Text("清空日志")
            }
        }

        ElevatedCard(modifier = Modifier.fillMaxWidth()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 120.dp)
                    .padding(12.dp)
            ) {
                if (logs.isEmpty()) {
                    Text("暂无日志")
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        logs.asReversed().take(60).forEach { line ->
                            Text(
                                text = line,
                                style = MaterialTheme.typography.bodySmall
                            )
                        }
                    }
                }
            }
        }
    }
}

private fun isServerUrlAllowed(value: String): Boolean {
    if (value.isBlank()) return false

    return try {
        val uri = URI(value)
        val scheme = uri.scheme?.lowercase() ?: return false
        val host = uri.host?.lowercase() ?: return false
        (scheme == "http" || scheme == "https") && host.isNotBlank()
    } catch (_: Exception) {
        false
    }
}

private fun hasNotificationAccess(context: android.content.Context): Boolean {
    val enabled = Settings.Secure.getString(
        context.contentResolver,
        "enabled_notification_listeners"
    ) ?: return false

    return enabled.split(':').any { flattened ->
        ComponentName.unflattenFromString(flattened)?.packageName == context.packageName
    }
}

private fun openNotificationAccessSettings(context: android.content.Context) {
    val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    context.startActivity(intent)
}

private fun isIgnoringBatteryOptimizations(context: android.content.Context): Boolean {
    val powerManager = context.getSystemService(PowerManager::class.java)
    return powerManager.isIgnoringBatteryOptimizations(context.packageName)
}

private fun requestIgnoreBatteryOptimizations(context: android.content.Context) {
    val directIntent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
        data = Uri.parse("package:${context.packageName}")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }

    runCatching {
        context.startActivity(directIntent)
    }.getOrElse {
        val fallbackIntent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(fallbackIntent)
    }
}
