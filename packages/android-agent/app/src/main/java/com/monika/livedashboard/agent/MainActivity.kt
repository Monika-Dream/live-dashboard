package com.monika.livedashboard.agent

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
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
    var statusText by rememberSaveable { mutableStateOf("空闲") }

    val usagePermissionGranted = UsageTracker.hasUsageStatsPermission(context)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("实时看板助手", style = MaterialTheme.typography.headlineSmall)
        Text(
            "上报设备活动前需要用户授权，无需 root。",
            style = MaterialTheme.typography.bodyMedium
        )

        HorizontalDivider()

        OutlinedTextField(
            value = serverUrl,
            onValueChange = { serverUrl = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("服务器地址") },
            singleLine = true,
            placeholder = { Text("https://example.com") }
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

        Text(
            if (usagePermissionGranted) "使用情况访问权限：已授权"
            else "使用情况访问权限：未授权",
            style = MaterialTheme.typography.bodyMedium
        )

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { UsageTracker.openUsageAccessSettings(context) }) {
                Text("打开使用情况访问权限")
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                onClick = {
                    val heartbeat = heartbeatText.toIntOrNull()?.coerceIn(10, 50) ?: 30
                    val normalizedServer = serverUrl.trim().trimEnd('/')
                    if (!isServerUrlAllowed(normalizedServer)) {
                        statusText = "服务器地址必须使用 HTTPS（localhost 除外）。"
                        return@Button
                    }
                    if (token.trim().isBlank()) {
                        statusText = "必须填写 Token 密钥。"
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
                            isRunningEnabled = settingsStore.load().isRunningEnabled
                        )
                    )
                    statusText = "设置已保存。"
                }
            ) {
                Text("保存设置")
            }

            Button(
                onClick = {
                    if (!consentGiven) {
                        statusText = "启动前必须先同意授权。"
                        return@Button
                    }
                    if (!reportActivity) {
                        statusText = "请先开启活动上报。"
                        return@Button
                    }
                    if (!UsageTracker.hasUsageStatsPermission(context)) {
                        statusText = "请先授予使用情况访问权限。"
                        return@Button
                    }

                    val heartbeat = heartbeatText.toIntOrNull()?.coerceIn(10, 50) ?: 30
                    val normalizedServer = serverUrl.trim().trimEnd('/')
                    if (!isServerUrlAllowed(normalizedServer) || token.trim().isBlank()) {
                        statusText = "请填写有效的服务器地址和 Token 密钥。"
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
                            isRunningEnabled = true
                        )
                    )

                    val serviceIntent = Intent(context, TrackingService::class.java).apply {
                        action = TrackingService.ACTION_START
                    }
                    ContextCompat.startForegroundService(context, serviceIntent)
                    statusText = "监听已启动。"
                }
            ) {
                Text("开始监听")
            }

            Button(
                onClick = {
                    settingsStore.setRunningEnabled(false)
                    val serviceIntent = Intent(context, TrackingService::class.java).apply {
                        action = TrackingService.ACTION_STOP
                    }
                    context.startService(serviceIntent)
                    statusText = "监听已停止。"
                }
            ) {
                Text("停止监听")
            }
        }

        HorizontalDivider()
        Text("状态：$statusText")
    }
}

private fun isServerUrlAllowed(value: String): Boolean {
    if (value.isBlank()) return false

    return try {
        val uri = URI(value)
        val scheme = uri.scheme?.lowercase() ?: return false
        val host = uri.host?.lowercase() ?: return false
        val localhost = host == "localhost" || host == "127.0.0.1"
        scheme == "https" || localhost
    } catch (_: Exception) {
        false
    }
}
