/*
 * 设置页：服务器地址 / Token 配置（ServerUrlPolicy 校验）+ 后台监听开关（启停 DashboardHeartbeatService）。
 */
package com.monika.dashboard.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.monika.dashboard.data.SettingsStore
import com.monika.dashboard.monitor.CurrentAppDetector
import com.monika.dashboard.monitor.MusicMetadataProvider
import com.monika.dashboard.service.DashboardHeartbeatService
import com.monika.dashboard.service.HeartbeatWorker
import com.monika.dashboard.ui.theme.Primary
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.coroutines.cancellation.CancellationException

@Composable
fun SetupScreen(settings: SettingsStore) {
    val scope = rememberCoroutineScope()
    val scrollState = rememberScrollState()
    val context = LocalContext.current

    val serverUrl by settings.serverUrl.collectAsState(initial = "")
    val reportInterval by settings.reportInterval.collectAsState(initial = HeartbeatWorker.DEFAULT_INTERVAL_SECONDS)
    val monitoringEnabled by settings.monitoringEnabled.collectAsState(initial = false)

    var urlInput by remember(serverUrl) { mutableStateOf(serverUrl) }
    var tokenInput by remember { mutableStateOf("") }
    var intervalInput by remember(reportInterval) { mutableStateOf(reportInterval.toString()) }
    val currentAppDetector = remember(context) { CurrentAppDetector(context.applicationContext) }
    val musicProvider = remember(context) { MusicMetadataProvider(context.applicationContext) }
    var tick by remember { mutableIntStateOf(0) }
    val usageAccessGranted = remember(tick) { currentAppDetector.hasUsageAccess() }
    val accessibilityAccessGranted = remember(tick) { currentAppDetector.hasAccessibilityAccess() }
    val notificationAccessGranted = remember(tick) { musicProvider.hasNotificationAccess() }

    // Token 走加密存储，读取时放到后台线程，避免阻塞首屏。
    LaunchedEffect(Unit) {
        try {
            val token = withContext(Dispatchers.IO) { settings.getToken() }
            tokenInput = token ?: ""
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            tokenInput = ""
        }
    }
    LaunchedEffect(Unit) {
        while (true) {
            delay(3000)
            tick++
        }
    }
    var showToken by remember { mutableStateOf(false) }
    var statusMsg by remember { mutableStateOf<String?>(null) }
    var urlError by remember { mutableStateOf<String?>(null) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Text(
            text = "服务器配置",
            style = MaterialTheme.typography.headlineMedium
        )

        OutlinedTextField(
            value = urlInput,
            onValueChange = {
                urlInput = it
                urlError = null
            },
            label = { Text("服务器地址") },
            placeholder = { Text("https://your-dashboard.example.com") },
            isError = urlError != null,
            supportingText = urlError?.let { err -> { Text(err) } }
                ?: { Text("必须使用 HTTPS；局域网/本机地址允许 HTTP") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(8.dp)
        )

        OutlinedTextField(
            value = tokenInput,
            onValueChange = { tokenInput = it },
            label = { Text("Token 密钥") },
            singleLine = true,
            visualTransformation = if (showToken) VisualTransformation.None
                else PasswordVisualTransformation(),
            trailingIcon = {
                TextButton(onClick = { showToken = !showToken }) {
                    Text(if (showToken) "隐藏" else "显示")
                }
            },
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(8.dp)
        )

        OutlinedTextField(
            value = intervalInput,
            onValueChange = { intervalInput = it.filter { c -> c.isDigit() } },
            label = { Text("心跳间隔（秒）") },
            supportingText = {
                Text(
                    "${HeartbeatWorker.MIN_INTERVAL_SECONDS}-${HeartbeatWorker.MAX_INTERVAL_SECONDS} 秒；后台稳定模式会显示常驻通知"
                )
            },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(8.dp)
        )

        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(8.dp),
            color = MaterialTheme.colorScheme.surfaceVariant
        ) {
            Column(
                modifier = Modifier.padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    text = "后台权限",
                    style = MaterialTheme.typography.titleMedium
                )
                Text(
                    text = "想让后台监听尽量稳定，建议至少开启“应用使用情况访问 + 无障碍服务”。音乐识别则额外依赖“通知访问”。",
                    style = MaterialTheme.typography.bodySmall
                )

                PermissionShortcutRow(
                    title = "应用使用情况访问",
                    granted = usageAccessGranted,
                    onClick = { context.startActivity(CurrentAppDetector.usageAccessSettingsIntent()) }
                )
                PermissionShortcutRow(
                    title = "无障碍服务（推荐）",
                    granted = accessibilityAccessGranted,
                    onClick = { context.startActivity(CurrentAppDetector.accessibilitySettingsIntent()) }
                )
                PermissionShortcutRow(
                    title = "通知访问（音乐识别）",
                    granted = notificationAccessGranted,
                    onClick = { context.startActivity(MusicMetadataProvider.notificationListenerSettingsIntent()) }
                )
            }
        }

        Button(
            onClick = {
                scope.launch {
                    val url = urlInput.trim()
                    if (!SettingsStore.validateUrl(url)) {
                        urlError = "地址无效：必须使用 HTTPS，或局域网/本机 HTTP 地址"
                        return@launch
                    }
                    if (!settings.isSecureStorageAvailable) {
                        statusMsg = "无法保存：安全存储不可用"
                        return@launch
                    }
                    settings.setServerUrl(url)
                    settings.setToken(tokenInput)
                    val seconds = intervalInput.toIntOrNull()?.coerceIn(
                        HeartbeatWorker.MIN_INTERVAL_SECONDS,
                        HeartbeatWorker.MAX_INTERVAL_SECONDS,
                    ) ?: HeartbeatWorker.DEFAULT_INTERVAL_SECONDS
                    settings.setReportInterval(seconds)
                    intervalInput = seconds.toString()
                    if (monitoringEnabled) {
                        DashboardHeartbeatService.start(context)
                        statusMsg = "设置已保存，并已应用新的后台监听间隔（${seconds} 秒）"
                    } else {
                        statusMsg = "设置已保存"
                    }
                }
            },
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(8.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Primary)
        ) {
            Text("保存设置")
        }

        Button(
            onClick = {
                scope.launch {
                    val newState = !monitoringEnabled
                    settings.setMonitoringEnabled(newState)
                    if (newState) {
                        val seconds = intervalInput.toIntOrNull()?.coerceIn(
                            HeartbeatWorker.MIN_INTERVAL_SECONDS,
                            HeartbeatWorker.MAX_INTERVAL_SECONDS,
                        ) ?: HeartbeatWorker.DEFAULT_INTERVAL_SECONDS
                        settings.setReportInterval(seconds)
                        intervalInput = seconds.toString()
                        DashboardHeartbeatService.start(context)
                        statusMsg = when {
                            accessibilityAccessGranted ->
                                "监听已开启，当前间隔 ${seconds} 秒；已启用无障碍稳定模式"
                            usageAccessGranted ->
                                "监听已开启，当前间隔 ${seconds} 秒；当前使用 UsageStats 模式"
                            else ->
                                "监听已开启，但还没授权前台应用识别权限；请先开启“应用使用情况访问”或“无障碍服务”"
                        }
                    } else {
                        DashboardHeartbeatService.stop(context)
                        statusMsg = "监听已关闭"
                    }
                }
            },
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(8.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = if (monitoringEnabled)
                    MaterialTheme.colorScheme.error
                else Primary
            )
        ) {
            Text(if (monitoringEnabled) "关闭监听" else "开始监听")
        }

        statusMsg?.let { msg ->
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(8.dp),
                color = MaterialTheme.colorScheme.surfaceVariant
            ) {
                Text(
                    text = msg,
                    modifier = Modifier.padding(12.dp),
                    style = MaterialTheme.typography.bodyMedium
                )
            }
        }

        if (!settings.isSecureStorageAvailable) {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(8.dp),
                color = MaterialTheme.colorScheme.errorContainer
            ) {
                Text(
                    text = "安全存储不可用，Token 无法安全保存。",
                    modifier = Modifier.padding(12.dp),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onErrorContainer
                )
            }
        }
    }
}

@Composable
private fun PermissionShortcutRow(
    title: String,
    granted: Boolean,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = "$title：${if (granted) "已授权" else "未授权"}",
            style = MaterialTheme.typography.bodyMedium
        )
        TextButton(onClick = onClick) {
            Text(if (granted) "去查看" else "去授权")
        }
    }
}
