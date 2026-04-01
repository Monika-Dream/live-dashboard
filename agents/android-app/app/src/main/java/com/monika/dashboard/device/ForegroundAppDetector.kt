package com.monika.dashboard.device

import android.app.AppOpsManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import com.monika.dashboard.data.DebugLog
import com.monika.dashboard.data.SettingsStore
import com.monika.dashboard.network.ReportClient
import java.util.concurrent.Executors

class ForegroundAppDetector(
    private val context: Context,
    private val settings: SettingsStore
) {
    private val executor = Executors.newSingleThreadExecutor()
    private val handler = Handler(Looper.getMainLooper())
    private var lastReportedApp: String? = null
    private var lastReportTime: Long = 0
    private const val MIN_REPORT_INTERVAL_MS = 1000L

    private val pollRunnable = object : Runnable {
        override fun run() {
            detectAndReport()
            handler.postDelayed(this, 5000L)
        }
    }

    fun start() {
        if (!hasUsageStatsPermission()) {
            DebugLog.log("前台检测", "未授权使用情况访问权限")
            Log.w("ForegroundApp", "Usage stats permission not granted")
            return
        }
        handler.postDelayed(pollRunnable, 5000L)
        Log.i("ForegroundApp", "Detector started")
    }

    fun stop() {
        handler.removeCallbacks(pollRunnable)
        Log.i("ForegroundApp", "Detector stopped")
    }

    fun hasUsageStatsPermission(): Boolean {
        val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            appOps.unsafeCheckOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                android.os.Process.myUid(),
                context.packageName
            )
        } else {
            @Suppress("DEPRECATION")
            appOps.checkOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                android.os.Process.myUid(),
                context.packageName
            )
        }
        return mode == AppOpsManager.MODE_ALLOWED
    }

    fun openUsageStatsSettings(): Intent {
        return Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
    }

    private fun detectAndReport() {
        executor.execute {
            val now = System.currentTimeMillis()
            val foregroundPackage = try {
                getForegroundPackage()
            } catch (e: Exception) {
                DebugLog.log("前台检测", "获取失败: ${e.message}")
                null
            }

            if (foregroundPackage == null) return@execute

            val appId = if (foregroundPackage == context.packageName) {
                "android"
            } else {
                foregroundPackage
            }

            if (appId == lastReportedApp && now - lastReportTime < 5000) return@execute

            lastReportedApp = appId
            lastReportTime = now

            val url = try { settings.serverUrl.first() } catch (_: Exception) { "" }
            val token = try { settings.getToken() } catch (_: Exception) { null }
            if (url.isEmpty() || token.isNullOrEmpty()) return@execute

            var client: ReportClient? = null
            try {
                client = ReportClient(url, token)
                val result = client.reportApp(
                    appId = appId,
                    windowTitle = appId,
                    musicTitle = null,
                    musicArtist = null,
                    musicApp = null
                )

                if (result.isSuccess) {
                    DebugLog.log("前台检测", "上报: $appId")
                    Log.i("ForegroundApp", "Reported: $appId")
                }
            } catch (e: Exception) {
                DebugLog.log("前台检测", "异常: ${e.message}")
            } finally {
                runCatching { client?.shutdown() }
            }
        }
    }

    @Suppress("DEPRECATION")
    private fun getForegroundPackage(): String? {
        val usageStatsManager = context.getSystemService(Context.USAGE_STATS_SERVICE) as android.app.usage.UsageStatsManager
        val now = System.currentTimeMillis()
        val stats = usageStatsManager.queryUsageStats(
            android.app.usage.UsageStatsManager.INTERVAL_DAILY,
            now - 1000 * 60,
            now
        )

        if (stats.isNullOrEmpty()) return null

        var latestPackage: String? = null
        var latestTime = 0L

        for (stat in stats) {
            if (stat.lastTimeUsed > latestTime) {
                latestTime = stat.lastTimeUsed
                latestPackage = stat.packageName
            }
        }

        return latestPackage
    }
}
