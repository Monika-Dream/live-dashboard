/*
 * Compose 主界面脚手架：Setup / Health / Status 三个 Tab + 顶栏连接状态（每 5s 调 ReportClient.testConnection）。
 * 联动：三个页面在 ui/screens/ 下；配置读写走 data/SettingsStore。
 */
package com.monika.dashboard

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.core.app.ActivityCompat
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.monika.dashboard.data.SettingsStore
import com.monika.dashboard.health.HealthConnectManager
import com.monika.dashboard.health.HealthSyncWorker
import com.monika.dashboard.network.ReportClient
import com.monika.dashboard.service.DashboardHeartbeatService
import com.monika.dashboard.ui.screens.HealthScreen
import com.monika.dashboard.ui.screens.SetupScreen
import com.monika.dashboard.ui.screens.StatusScreen
import com.monika.dashboard.ui.theme.DashboardTheme
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : ComponentActivity() {

    private lateinit var settings: SettingsStore

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        settings = SettingsStore(applicationContext)
        enableEdgeToEdge()
        requestNotificationPermission()
        restoreHeartbeatServiceIfNeeded()

        setContent {
            DashboardTheme {
                Scaffold(
                    modifier = Modifier.fillMaxSize(),
                    topBar = { DashboardTopBar(settings) }
                ) { innerPadding ->
                    MainContent(
                        settings = settings,
                        modifier = Modifier.padding(innerPadding)
                    )
                }
            }
        }
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(
                    this,
                    arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                    1001
                )
            }
        }
    }

    /**
     * 重启或 APP 升级后，如果用户之前开启了心跳监听，自动恢复前台服务。
     * DashboardHeartbeatService.start() 内部是幂等的。
     */
    private fun restoreHeartbeatServiceIfNeeded() {
        lifecycleScope.launch(Dispatchers.IO) {
            try {
                val enabled = settings.monitoringEnabled.first()
                val url = settings.serverUrl.first()
                val token = settings.getToken()
                if (enabled && url.isNotBlank() && !token.isNullOrBlank()) {
                    DashboardHeartbeatService.start(applicationContext)
                }
            } catch (e: kotlin.coroutines.cancellation.CancellationException) {
                throw e
            } catch (e: Exception) {
                // Best-effort restore — user can re-enable manually
                android.util.Log.w("MainActivity", "Failed to restore heartbeat service", e)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DashboardTopBar(settings: SettingsStore) {
    var connected by remember { mutableStateOf(false) }
    val serverUrl by settings.serverUrl.collectAsState(initial = "")

    // Auto-test connection every 5 seconds
    LaunchedEffect(serverUrl) {
        while (true) {
            val url = serverUrl.trim()
            val token = withContext(Dispatchers.IO) { settings.getToken() }
            if (url.isNotEmpty() && !token.isNullOrEmpty() && SettingsStore.validateUrl(url)) {
                val result = withContext(Dispatchers.IO) {
                    try {
                        ReportClient(url, token).testConnection()
                    } catch (_: Exception) {
                        Result.failure<Unit>(Exception("error"))
                    }
                }
                connected = result.isSuccess
            } else {
                connected = false
            }
            delay(5000L)
        }
    }

    TopAppBar(
        title = { Text("Monika Now") },
        actions = {
            Text(
                text = if (connected) "已连接" else "未连接",
                color = if (connected) Color(0xFF4CAF50) else Color(0xFFBDBDBD),
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(end = 16.dp)
            )
        }
    )
}

@Composable
private fun MainContent(settings: SettingsStore, modifier: Modifier = Modifier) {
    var selectedTab by rememberSaveable { mutableIntStateOf(0) }
    val tabs = listOf("设置", "健康", "状态")
    val context = LocalContext.current

    // Trigger foreground health sync once on app open
    LaunchedEffect(Unit) {
        val enabledTypes = settings.enabledHealthTypes.first()
        val url = settings.serverUrl.first()
        val token = withContext(Dispatchers.IO) { settings.getToken() }
        if (enabledTypes.isNotEmpty() && url.isNotEmpty() && !token.isNullOrEmpty()
            && HealthConnectManager.isAvailable(context)) {
            HealthSyncWorker.syncNow(context, foreground = true)
        }
    }

    Column(modifier = modifier.fillMaxSize()) {
        TabRow(
            selectedTabIndex = selectedTab,
            containerColor = MaterialTheme.colorScheme.surface,
            contentColor = MaterialTheme.colorScheme.primary
        ) {
            tabs.forEachIndexed { index, title ->
                Tab(
                    selected = selectedTab == index,
                    onClick = { selectedTab = index },
                    text = { Text(title) }
                )
            }
        }

        when (selectedTab) {
            0 -> SetupScreen(settings)
            1 -> HealthScreen(settings)
            2 -> StatusScreen()
        }
    }
}
