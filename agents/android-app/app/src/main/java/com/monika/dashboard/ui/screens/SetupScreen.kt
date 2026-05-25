package com.monika.dashboard.ui.screens

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.clickable
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
import androidx.core.app.ActivityCompat
import com.monika.dashboard.data.SettingsStore
import com.monika.dashboard.realtime.MessageSocketManager
import com.monika.dashboard.service.HeartbeatWorker
import com.monika.dashboard.ui.theme.Primary
import kotlinx.coroutines.Dispatchers
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
    val capabilityMode by settings.capabilityMode.collectAsState(initial = "normal")
    val uploadLocation by settings.uploadLocation.collectAsState(initial = false)
    val uploadVpnStatus by settings.uploadVpnStatus.collectAsState(initial = false)
    val uploadInputState by settings.uploadInputState.collectAsState(initial = false)

    var urlInput by remember(serverUrl) { mutableStateOf(serverUrl) }
    var tokenInput by remember { mutableStateOf("") }
    var intervalInput by remember(reportInterval) { mutableStateOf(reportInterval.toString()) }
    var modeInput by remember(capabilityMode) { mutableStateOf(capabilityMode) }
    var locationInput by remember(uploadLocation) { mutableStateOf(uploadLocation) }
    var vpnInput by remember(uploadVpnStatus) { mutableStateOf(uploadVpnStatus) }
    var inputStateInput by remember(uploadInputState) { mutableStateOf(uploadInputState) }

    // Load token asynchronously to avoid blocking main thread
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

        // Server URL
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
                ?: { Text("必须使用 HTTPS（仅 localhost 允许 HTTP）") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(8.dp)
        )

        Text(text = "采集模式", style = MaterialTheme.typography.titleSmall)
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            CapabilityOption(
                selected = modeInput == "normal",
                title = "normal",
                body = "只上报在线、电量和健康数据，不读取当前应用"
            ) { modeInput = "normal" }
            CapabilityOption(
                selected = modeInput == "root",
                title = "root",
                body = "显式开启后低频读取系统状态，失败会自动降级"
            ) { modeInput = "root" }
            CapabilityOption(
                selected = modeInput == "lsposed",
                title = "lsposed",
                body = "使用 LSPosed system scope 事件，减少轮询和耗电"
            ) { modeInput = "lsposed" }
        }

        Text(text = "可选上报", style = MaterialTheme.typography.titleSmall)
        OptionalSwitch(
            checked = locationInput,
            title = "上传位置",
            body = "仅使用最近已知位置，不主动高频定位"
        ) { locationInput = it }
        OptionalSwitch(
            checked = vpnInput,
            title = "上传 VPN 状态",
            body = "只上传是否连接 VPN，不上传流量或域名"
        ) { vpnInput = it }
        OptionalSwitch(
            checked = inputStateInput,
            title = "上传输入状态",
            body = "只上传是否正在输入，不上传文本、剪贴板或候选词"
        ) { inputStateInput = it }

        // Token
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

        // Report Interval
        OutlinedTextField(
            value = intervalInput,
            onValueChange = { intervalInput = it.filter { c -> c.isDigit() } },
            label = { Text("心跳间隔（秒）") },
            supportingText = {
                Text(
                    "${HeartbeatWorker.MIN_INTERVAL_SECONDS}-${HeartbeatWorker.MAX_INTERVAL_SECONDS} 秒（服务端 60 秒判离线，预留缓冲）"
                )
            },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(8.dp)
        )

        // Save Button
        Button(
            onClick = {
                scope.launch {
                    val url = urlInput.trim()
                    if (!SettingsStore.validateUrl(url)) {
                        urlError = "地址无效：必须使用 HTTPS 或 http://localhost"
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
                    settings.setCapabilityMode(modeInput)
                    settings.setUploadLocation(locationInput)
                    settings.setUploadVpnStatus(vpnInput)
                    settings.setUploadInputState(inputStateInput)
                    if (locationInput) requestLocationPermissionIfNeeded(context)
                    intervalInput = seconds.toString()
                    if (monitoringEnabled) {
                        HeartbeatWorker.schedule(context, seconds)
                        statusMsg = "设置已保存，并已应用新的心跳间隔（${seconds} 秒）"
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

        // Start/Stop monitoring toggle
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
                        settings.setCapabilityMode(modeInput)
                        settings.setUploadLocation(locationInput)
                        settings.setUploadVpnStatus(vpnInput)
                        settings.setUploadInputState(inputStateInput)
                        if (locationInput) requestLocationPermissionIfNeeded(context)
                        intervalInput = seconds.toString()
                        HeartbeatWorker.schedule(context, seconds)
                        MessageSocketManager.ensureStarted(context)
                        statusMsg = "监听已开启，当前间隔 ${seconds} 秒"
                    } else {
                        HeartbeatWorker.cancel(context)
                        MessageSocketManager.stop()
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

        // Status message
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

        // Secure storage warning
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
private fun CapabilityOption(
    selected: Boolean,
    title: String,
    body: String,
    onSelect: () -> Unit,
) {
    Surface(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onSelect),
        shape = RoundedCornerShape(8.dp),
        color = if (selected) MaterialTheme.colorScheme.secondaryContainer
            else MaterialTheme.colorScheme.surfaceVariant,
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            RadioButton(selected = selected, onClick = onSelect)
            Column {
                Text(text = title, style = MaterialTheme.typography.labelLarge)
                Text(text = body, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
private fun OptionalSwitch(
    checked: Boolean,
    title: String,
    body: String,
    onChange: (Boolean) -> Unit,
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Switch(checked = checked, onCheckedChange = onChange)
            Column {
                Text(text = title, style = MaterialTheme.typography.labelLarge)
                Text(text = body, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

private fun requestLocationPermissionIfNeeded(context: android.content.Context) {
    val activity = context as? Activity ?: return
    val fineGranted = ActivityCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
        PackageManager.PERMISSION_GRANTED
    val coarseGranted = ActivityCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) ==
        PackageManager.PERMISSION_GRANTED
    if (!fineGranted && !coarseGranted) {
        ActivityCompat.requestPermissions(
            activity,
            arrayOf(
                Manifest.permission.ACCESS_COARSE_LOCATION,
                Manifest.permission.ACCESS_FINE_LOCATION,
            ),
            1002
        )
    }
}
