/*
 * WorkManager 周期任务：从 Health Connect 读增量数据，分批（500 条/批）上传到后端 /api/health-data。
 * 同步游标只在全部类型读取成功后才推进，部分失败时下次重读，避免静默丢数据。
 * 联动：由 HealthScreen 排程；读数据靠 HealthConnectManager；上传靠 ReportClient。
 */
package com.monika.dashboard.health

import android.content.Context
import android.util.Log
import androidx.work.*
import com.monika.dashboard.data.DebugLog
import com.monika.dashboard.data.SettingsStore
import com.monika.dashboard.network.ReportClient
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeout
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
        private const val KEY_FOREGROUND = "foreground"
        private const val KEY_FULL_SYNC = "full_sync"
        /** 单次上传批次大小，避免超大 JSON 请求体导致 OOM 或超时。 */
        private const val UPLOAD_BATCH_SIZE = 500

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

        /**
         * Trigger an immediate one-time sync.
         * @param foreground If true, skip background permission check (app is in foreground).
         * @param fullSync If true, ignore lastSyncTimestamp and do full 7-day lookback.
         */
        fun syncNow(context: Context, foreground: Boolean = false, fullSync: Boolean = false) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val request = OneTimeWorkRequestBuilder<HealthSyncWorker>()
                .setConstraints(constraints)
                .setInputData(workDataOf(
                    KEY_FOREGROUND to foreground,
                    KEY_FULL_SYNC to fullSync
                ))
                .build()

            WorkManager.getInstance(context).enqueueUniqueWork(
                WORK_NAME_ONCE,
                ExistingWorkPolicy.REPLACE,
                request
            )
            Log.i(TAG, "Triggered immediate health sync (foreground=$foreground, fullSync=$fullSync)")
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
            DebugLog.log("健康", "跳过同步: url=${url.isNotEmpty()}, token=${!token.isNullOrEmpty()}, types=${enabledTypes.size}")
            Log.w(TAG, "Skipping sync: missing config (url=${url.isNotEmpty()}, token=${!token.isNullOrEmpty()}, types=${enabledTypes.size})")
            return Result.success()
        }

        if (!HealthConnectManager.isAvailable(applicationContext)) {
            DebugLog.log("健康", "Health Connect 不可用，取消同步")
            Log.w(TAG, "Health Connect not available, cancelling periodic sync")
            cancel(applicationContext)
            return Result.success()
        }

        val manager = HealthConnectManager(applicationContext)
        val isForeground = inputData.getBoolean(KEY_FOREGROUND, false)
        val isFullSync = inputData.getBoolean(KEY_FULL_SYNC, false)
        DebugLog.log("健康", "同步开始 (${if (isForeground) "前台" else "后台"}${if (isFullSync) ", 全量" else ""})")

        // Background permission check: only for periodic background sync, not foreground
        if (!isForeground && manager.needsBackgroundPermission) {
            val granted = try {
                manager.getGrantedPermissions()
            } catch (e: Exception) {
                DebugLog.log("健康", "查询权限失败: ${e.message}，稍后重试")
                Log.w(TAG, "Failed to query permissions, will retry", e)
                return Result.retry()
            }
            val hasBgPerm = manager.backgroundReadPermission in granted

            if (!hasBgPerm) {
                DebugLog.log("健康", "后台读取权限未授权，跳过后台同步")
                Log.d(TAG, "Background read permission not granted, skipping periodic sync")
                return Result.success()
            }

            val backgroundAvailability = manager.getBackgroundReadAvailability()
            if (!backgroundAvailability.isAvailable) {
                if (backgroundAvailability.errorMessage.isNullOrEmpty()) {
                    DebugLog.log("健康", "设备当前不支持后台健康读取，保持打开 APP 时同步")
                    Log.w(TAG, "Background read feature unavailable")
                    return Result.success()
                }

                DebugLog.log(
                    "健康",
                    "后台读取能力检测失败：${backgroundAvailability.errorMessage}，本次仍尝试后台同步"
                )
                Log.w(
                    TAG,
                    "Background read feature check failed, will still attempt sync: ${backgroundAvailability.errorMessage}"
                )
            }
        }

        val client = try {
            ReportClient(url, token)
        } catch (e: Exception) {
            DebugLog.log("健康", "服务器连接失败: ${e.message}")
            Log.e(TAG, "Invalid server URL: ${e.message}")
            return Result.failure()
        }

        return try {
            // Incremental sync: read from lastSyncTimestamp
            val until = Instant.now()
            val lastSync = settings.lastSyncTimestamp.first()
            val maxLookback = until.minus(7, ChronoUnit.DAYS)
            val since = if (isFullSync || lastSync <= 0) {
                maxLookback
            } else {
                // 5-minute overlap window to cover delayed writes; server deduplicates
                Instant.ofEpochMilli(lastSync).minus(5, ChronoUnit.MINUTES)
                    .coerceIn(maxLookback, until)
            }

            val fmt = java.time.format.DateTimeFormatter.ofPattern("MM-dd HH:mm")
                .withZone(java.time.ZoneId.systemDefault())
            val syncMode = if (isFullSync || lastSync <= 0) "全量" else "增量"
            DebugLog.log("健康", "${syncMode}同步, 类型: ${enabledTypes.size}, 范围: ${fmt.format(since)}..${fmt.format(until)}")
            val readResult = withTimeout(60_000L) {
                manager.readRecords(enabledTypes, since, until)
            }
            val records = readResult.records

            if (!isForeground && readResult.allAttemptedTypesDenied) {
                DebugLog.log("健康", "后台读取被系统拒绝，未推进同步游标，请重新授权后台读取")
                Log.w(TAG, "Background read denied for all requested types")
                return Result.success()
            }

            DebugLog.log("健康", "读取完成, 共 ${records.size} 条")

            // 只有所有类型都成功读取时才推进游标，部分失败时保持原位，
            // 下次同步会重新读取失败类型的数据，避免静默丢失。
            val canAdvanceCursor = readResult.allTypesSucceeded

            if (records.isEmpty()) {
                DebugLog.log("健康", "无新数据")
                Log.i(TAG, "No new records")
                if (canAdvanceCursor) {
                    settings.setLastSyncTimestamp(until.toEpochMilli())
                }
                Result.success()
            } else {
                // 分批上传，每批最多 UPLOAD_BATCH_SIZE 条。
                val batches = records.chunked(UPLOAD_BATCH_SIZE)
                var uploadedCount = 0
                var uploadFailed = false
                for ((idx, batch) in batches.withIndex()) {
                    val result = client.reportHealthData(batch)
                    if (result.isSuccess) {
                        uploadedCount += batch.size
                        if (batches.size > 1) {
                            DebugLog.log("健康", "批次 ${idx + 1}/${batches.size}: ${batch.size} 条已上传")
                        }
                    } else {
                        uploadFailed = true
                        DebugLog.log("健康", "批次 ${idx + 1} 上传失败: ${result.exceptionOrNull()?.message}")
                        Log.w(TAG, "Batch ${idx + 1} failed: ${result.exceptionOrNull()?.message}")
                        break
                    }
                }

                if (uploadFailed) {
                    if (uploadedCount > 0) {
                        DebugLog.log("健康", "已部分上传 $uploadedCount/${records.size} 条，稍后重试剩余")
                    }
                    DebugLog.log("健康", "同步失败")
                    Result.retry()
                } else {
                    if (canAdvanceCursor) {
                        settings.setLastSyncTimestamp(until.toEpochMilli())
                    } else {
                        DebugLog.log("健康", "部分类型读取失败，已上传可用数据但未推进游标")
                    }
                    DebugLog.log("健康", "已同步 ${records.size} 条记录")
                    Log.i(TAG, "Synced ${records.size} records")
                    Result.success()
                }
            }
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            DebugLog.log("健康", "同步异常: ${e.message}")
            Log.e(TAG, "Sync error", e)
            Result.retry()
        } finally {
            // 共享 OkHttpClient，不再单独 shutdown
        }
    }
}
