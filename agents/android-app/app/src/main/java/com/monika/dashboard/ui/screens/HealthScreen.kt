package com.monika.dashboard.ui.screens

import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.health.connect.client.PermissionController
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.repeatOnLifecycle
import com.monika.dashboard.data.SettingsStore
import com.monika.dashboard.health.HealthConnectManager
import com.monika.dashboard.health.HealthDataType
import com.monika.dashboard.health.HealthSyncWorker
import com.monika.dashboard.ui.theme.Border
import com.monika.dashboard.ui.theme.Primary
import com.monika.dashboard.ui.theme.Secondary
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HealthScreen(settings: SettingsStore) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val enabledTypes by settings.enabledHealthTypes.collectAsState(initial = emptySet())
    val syncInterval by settings.healthSyncInterval.collectAsState(initial = 15)

    // Re-check HC status on each resume (install/permission changes)
    var isAvailable by remember { mutableStateOf(HealthConnectManager.isAvailable(context)) }
    var isInstalled by remember { mutableStateOf(HealthConnectManager.isInstalled(context)) }
    var permissionsGranted by remember { mutableStateOf(false) }
    val lifecycleOwner = LocalLifecycleOwner.current

    // Manager is always safe to construct (client is lazy)
    val hcManager = remember(context) { HealthConnectManager(context) }

    // Permission launcher uses static contract (doesn't need client)
    val permissionLauncher = rememberLauncherForActivityResult(
        contract = PermissionController.createRequestPermissionResultContract(),
        onResult = {
            scope.launch {
                if (isAvailable) {
                    try {
                        val granted = hcManager.getGrantedPermissions()
                        permissionsGranted = hcManager.dataReadPermissions.all { it in granted }
                    } catch (e: CancellationException) {
                        throw e
                    } catch (_: Exception) {
                        permissionsGranted = false
                    }
                }
            }
        }
    )

    LaunchedEffect(lifecycleOwner) {
        lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            isAvailable = HealthConnectManager.isAvailable(context)
            isInstalled = HealthConnectManager.isInstalled(context)
            if (isAvailable) {
                try {
                    val granted = hcManager.getGrantedPermissions()
                    permissionsGranted = hcManager.dataReadPermissions.all { it in granted }
                } catch (e: CancellationException) {
                    throw e
                } catch (_: Exception) {
                    permissionsGranted = false
                }
            } else {
                permissionsGranted = false
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text(
            text = "健康数据",
            style = MaterialTheme.typography.headlineMedium
        )

        // Health Connect status
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, Border, RoundedCornerShape(8.dp)),
            shape = RoundedCornerShape(8.dp)
        ) {
            Row(
                modifier = Modifier.padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Health Connect",
                        style = MaterialTheme.typography.titleMedium
                    )
                    Text(
                        text = when {
                            isAvailable -> "可用"
                            isInstalled -> "已安装但未就绪"
                            else -> "未安装"
                        },
                        style = MaterialTheme.typography.bodySmall,
                        color = if (isAvailable) Secondary else MaterialTheme.colorScheme.error
                    )
                }
                if (!isInstalled) {
                    OutlinedButton(
                        onClick = {
                            try {
                                val intent = Intent(Intent.ACTION_VIEW).apply {
                                    data = Uri.parse(
                                        "https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata"
                                    )
                                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                                }
                                context.startActivity(intent)
                            } catch (_: Exception) {
                                Toast.makeText(context, "无法打开应用商店", Toast.LENGTH_SHORT).show()
                            }
                        },
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text("安装")
                    }
                } else if (isAvailable && !permissionsGranted) {
                    OutlinedButton(
                        onClick = {
                            permissionLauncher.launch(hcManager.dataReadPermissions)
                        },
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text("授权")
                    }
                }
            }
        }

        // Sync interval
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text("同步间隔：${syncInterval} 分钟", style = MaterialTheme.typography.bodyMedium)
            Row {
                listOf(15, 30, 60).forEach { mins ->
                    FilterChip(
                        selected = syncInterval == mins,
                        onClick = {
                            scope.launch {
                                settings.setHealthSyncInterval(mins)
                                if (enabledTypes.isNotEmpty()) {
                                    HealthSyncWorker.schedule(context, mins)
                                }
                            }
                        },
                        label = { Text("${mins}分") },
                        modifier = Modifier.padding(horizontal = 2.dp)
                    )
                }
            }
        }

        // Manual sync button
        Button(
            onClick = {
                scope.launch {
                    HealthSyncWorker.syncNow(context)
                }
            },
            enabled = isAvailable && enabledTypes.isNotEmpty(),
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(8.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Primary)
        ) {
            Text("立即同步")
        }

        Divider(color = Border, thickness = 1.dp)

        // Data types list
        Text(
            text = "选择要同步的数据类型",
            style = MaterialTheme.typography.titleMedium
        )

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            items(HealthDataType.entries.toList()) { type ->
                val checked = type.key in enabledTypes
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(
                            1.dp,
                            if (checked) Primary.copy(alpha = 0.5f) else Border,
                            RoundedCornerShape(8.dp)
                        ),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = type.icon,
                            modifier = Modifier.width(32.dp)
                        )
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = type.displayName,
                                style = MaterialTheme.typography.bodyMedium
                            )
                            Text(
                                text = type.unit,
                                style = MaterialTheme.typography.bodySmall
                            )
                        }
                        Switch(
                            checked = checked,
                            onCheckedChange = { isChecked ->
                                scope.launch {
                                    val updated = if (isChecked) {
                                        enabledTypes + type.key
                                    } else {
                                        enabledTypes - type.key
                                    }
                                    settings.setEnabledHealthTypes(updated)
                                    if (updated.isNotEmpty()) {
                                        HealthSyncWorker.schedule(context, syncInterval)
                                    } else {
                                        HealthSyncWorker.cancel(context)
                                    }
                                }
                            },
                            enabled = isAvailable
                        )
                    }
                }
            }
        }
    }
}
