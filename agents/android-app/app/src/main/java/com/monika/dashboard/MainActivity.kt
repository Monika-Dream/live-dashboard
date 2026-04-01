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
import com.monika.dashboard.service.HeartbeatWorker
import com.monika.dashboard.ui.screens.HealthScreen
import com.monika.dashboard.ui.screens.SetupScreen
import com.monika.dashboard.ui.screens.StatusScreen
import com.monika.dashboard.ui.theme.DashboardTheme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext

class MainActivity : ComponentActivity() {

    private lateinit var settings: SettingsStore

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        settings = SettingsStore(applicationContext)
        enableEdgeToEdge()
        requestNotificationPermission()

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
                        val client = ReportClient(url, token)
                        try {
                            client.testConnection()
                        } finally {
                            client.shutdown()
                        }
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

    // Trigger foreground health sync, schedule background sync, and start heartbeat on app open
    LaunchedEffect(Unit) {
        val enabledTypes = settings.enabledHealthTypes.first()
        val url = settings.serverUrl.first()
        val token = withContext(Dispatchers.IO) { settings.getToken() }
        val monitoringEnabled = settings.monitoringEnabled.first()
        val reportInterval = settings.reportInterval.first()

        if (url.isNotEmpty() && !token.isNullOrEmpty()) {
            // Schedule heartbeat if monitoring is enabled
            if (monitoringEnabled) {
                HeartbeatWorker.schedule(context, reportInterval)
            }

            // Schedule health sync and sync now if health types are configured
            if (enabledTypes.isNotEmpty() && HealthConnectManager.isAvailable(context)) {
                val syncInterval = settings.healthSyncInterval.first()
                HealthSyncWorker.schedule(context, syncInterval)
                HealthSyncWorker.syncNow(context, foreground = true)
            }
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
