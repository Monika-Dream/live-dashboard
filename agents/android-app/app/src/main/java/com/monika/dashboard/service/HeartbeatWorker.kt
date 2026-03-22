package com.monika.dashboard.service

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.util.Log
import androidx.work.*
import com.monika.dashboard.data.DebugLog
import com.monika.dashboard.data.SettingsStore
import com.monika.dashboard.network.ReportClient
import kotlinx.coroutines.flow.first
import java.util.concurrent.TimeUnit

/**
 * WorkManager-based heartbeat that survives Xiaomi/HyperOS process freezer.
 * Uses self-rescheduling OneTimeWorkRequest to bypass the 15-min periodic minimum.
 * AlarmManager under the hood wakes the app even when frozen by cgroup freezer.
 */
class HeartbeatWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    companion object {
        private const val TAG = "Heartbeat"
        private const val WORK_NAME = "heartbeat_report"
        private const val KEY_INTERVAL_SEC = "interval_sec"

        fun schedule(context: Context, intervalSeconds: Int = 60) {
            val safe = intervalSeconds.coerceIn(30, 300)
            enqueueNext(context, safe)
            DebugLog.log("心跳Worker", "已启动，间隔 ${safe} 秒")
            Log.i(TAG, "Scheduled heartbeat every ${safe}s")
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
            DebugLog.log("心跳Worker", "已取消")
            Log.i(TAG, "Cancelled heartbeat")
        }

        private fun enqueueNext(context: Context, intervalSec: Int) {
            val request = OneTimeWorkRequestBuilder<HeartbeatWorker>()
                .setInitialDelay(intervalSec.toLong(), TimeUnit.SECONDS)
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
                .setInputData(workDataOf(KEY_INTERVAL_SEC to intervalSec))
                .build()

            WorkManager.getInstance(context).enqueueUniqueWork(
                WORK_NAME,
                ExistingWorkPolicy.REPLACE,
                request
            )
        }
    }

    override suspend fun doWork(): Result {
        val settings = SettingsStore(applicationContext)
        val intervalSec = inputData.getInt(KEY_INTERVAL_SEC, 60)

        val enabled = settings.monitoringEnabled.first()
        if (!enabled) {
            DebugLog.log("心跳Worker", "监听未开启，跳过")
            enqueueNext(applicationContext, intervalSec)
            return Result.success()
        }

        val url = settings.serverUrl.first()
        val token = settings.getToken()
        if (url.isEmpty() || token.isNullOrEmpty()) {
            DebugLog.log("心跳Worker", "URL或Token未配置，跳过")
            enqueueNext(applicationContext, intervalSec)
            return Result.success()
        }

        var client: ReportClient? = null
        try {
            client = ReportClient(url, token)

            val appId = "android"
            val battery = getBatteryInfo()

            val result = client.reportApp(
                appId = appId,
                windowTitle = appId,
                batteryPercent = battery?.first,
                batteryCharging = battery?.second
            )

            if (result.isSuccess) {
                DebugLog.log("心跳Worker", "上报成功: $appId")
                Log.i(TAG, "Heartbeat sent: $appId")
            } else {
                DebugLog.log("心跳Worker", "上报失败: ${result.exceptionOrNull()?.message}")
            }
        } catch (e: Exception) {
            DebugLog.log("心跳Worker", "异常: ${e.message}")
            Log.e(TAG, "Heartbeat error", e)
        } finally {
            runCatching { client?.shutdown() }
        }

        // Always reschedule next heartbeat
        enqueueNext(applicationContext, intervalSec)
        return Result.success()
    }

    private fun getBatteryInfo(): Pair<Int, Boolean>? {
        return try {
            val intent = applicationContext.registerReceiver(
                null, IntentFilter(Intent.ACTION_BATTERY_CHANGED)
            )
            intent?.let {
                val level = it.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
                val scale = it.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
                val status = it.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
                if (level >= 0 && scale > 0) {
                    val percent = (level * 100) / scale
                    val charging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                        status == BatteryManager.BATTERY_STATUS_FULL
                    Pair(percent, charging)
                } else null
            }
        } catch (_: Exception) {
            null
        }
    }
}
