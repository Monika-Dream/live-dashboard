package com.monika.dashboard.health

import android.content.Context
import android.util.Log
import androidx.work.*
import com.monika.dashboard.data.DebugLog
import com.monika.dashboard.data.SettingsStore
import com.monika.dashboard.network.ReportClient
import kotlinx.coroutines.flow.first
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.concurrent.TimeUnit

class HealthSyncWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    companion object {
        private const val TAG = "HealthSync"
        private const val WORK_NAME = "health_sync"
        private const val WORK_NAME_ONCE = "health_sync_once"

        fun schedule(context: Context, intervalMinutes: Int) {
            val safeInterval = intervalMinutes.coerceIn(15, 60).toLong()
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val request = PeriodicWorkRequestBuilder<HealthSyncWorker>(
                safeInterval, TimeUnit.MINUTES
            )
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 1, TimeUnit.MINUTES)
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.UPDATE,
                request
            )
            Log.i(TAG, "Scheduled health sync every ${safeInterval}min")
        }

        fun syncNow(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val request = OneTimeWorkRequestBuilder<HealthSyncWorker>()
                .setConstraints(constraints)
                .build()

            WorkManager.getInstance(context).enqueueUniqueWork(
                WORK_NAME_ONCE,
                ExistingWorkPolicy.REPLACE,
                request
            )
            Log.i(TAG, "Triggered immediate health sync")
        }

        fun cancel(context: Context) {
            val wm = WorkManager.getInstance(context)
            wm.cancelUniqueWork(WORK_NAME)
            wm.cancelUniqueWork(WORK_NAME_ONCE)
            Log.i(TAG, "Cancelled health sync")
        }
    }

    override suspend fun doWork(): Result {
        val settings = SettingsStore(applicationContext)
        val url = settings.serverUrl.first()
        val token = settings.getToken()
        val enabledTypes = settings.enabledHealthTypes.first()

        if (url.isEmpty() || token.isNullOrEmpty() || enabledTypes.isEmpty()) {
            Log.w(TAG, "Skipping sync: missing config")
            return Result.success()
        }

        if (!HealthConnectManager.isAvailable(applicationContext)) {
            Log.w(TAG, "Health Connect not available, cancelling periodic sync")
            cancel(applicationContext)
            return Result.success()
        }

        val manager = HealthConnectManager(applicationContext)

        val client = try {
            ReportClient(url, token)
        } catch (e: Exception) {
            Log.e(TAG, "Invalid server URL: ${e.message}")
            return Result.failure()
        }

        return try {
            val since = Instant.now().minus(3, ChronoUnit.HOURS)
            DebugLog.log("健康", "同步中, 类型: ${enabledTypes.joinToString()}")
            val records = manager.readRecords(enabledTypes, since)

            if (records.isEmpty()) {
                DebugLog.log("健康", "无新数据")
                Log.i(TAG, "No new records")
                return Result.success()
            }

            val result = client.reportHealthData(records)
            client.shutdown()

            if (result.isSuccess) {
                DebugLog.log("健康", "已同步 ${records.size} 条记录")
                Log.i(TAG, "Synced ${records.size} records")
                Result.success()
            } else {
                DebugLog.log("健康", "同步失败: ${result.exceptionOrNull()?.message}")
                Log.w(TAG, "Sync failed: ${result.exceptionOrNull()?.message}")
                Result.retry()
            }
        } catch (e: Exception) {
            DebugLog.log("健康", "同步异常: ${e.message}")
            Log.e(TAG, "Sync error", e)
            client.shutdown()
            Result.retry()
        }
    }
}
