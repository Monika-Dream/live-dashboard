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
    val reportInterval by settings.reportInterval.collectAsState(initial = 60)
    val monitoringEnabled by settings.monitoringEnabled.collectAsState(initial = false)

    var urlInput by remember(serverUrl) { mutableStateOf(serverUrl) }
    var tokenInput by remember { mutableStateOf("") }
    var intervalInput by remember(reportInterval) { mutableStateOf(reportInterval.toString()) }

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
            supportingText = { Text("10-300 秒") },
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
                    val seconds = intervalInput.toIntOrNull()?.coerceIn(10, 300) ?: 60
                    settings.setReportInterval(seconds)
                    statusMsg = "设置已保存"
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
                        val seconds = intervalInput.toIntOrNull()?.coerceIn(10, 300) ?: 60
                        HeartbeatWorker.schedule(context, seconds)
                    } else {
                        HeartbeatWorker.cancel(context)
                    }
                    statusMsg = if (newState) "监听已开启" else "监听已关闭"
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
