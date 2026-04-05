package com.monika.dashboard.service

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.PowerManager
import android.util.Log
import com.monika.dashboard.data.DebugLog
import com.monika.dashboard.data.SettingsStore
import com.monika.dashboard.monitor.CurrentAppDetector
import com.monika.dashboard.monitor.MusicMetadataProvider
import com.monika.dashboard.network.ReportClient
import kotlinx.coroutines.flow.first
import kotlin.coroutines.cancellation.CancellationException

data class HeartbeatRunResult(
    val summary: String,
    val appId: String? = null,
    val reported: Boolean = false
)

/**
 * 把“采样 + 上报”逻辑收敛到一个地方，前台服务和 WorkManager 都能复用。
 */
object HeartbeatReporter {

    private const val TAG = "HeartbeatReporter"
    private const val USAGE_EVENTS_LOOKBACK_FLOOR_MS = 2 * 60 * 1000L
    private const val USAGE_STATS_LOOKBACK_MS = 12 * 60 * 60 * 1000L

    suspend fun runOnce(
        context: Context,
        intervalSec: Int
    ): HeartbeatRunResult {
        val appContext = context.applicationContext
        val settings = SettingsStore(appContext)
        val url = settings.serverUrl.first()
        val token = settings.getToken()

        if (url.isBlank() || token.isNullOrBlank()) {
            val summary = "等待服务器地址和 Token"
            DebugLog.log("心跳", summary)
            return HeartbeatRunResult(summary = summary)
        }

        var client: ReportClient? = null
        return try {
            client = ReportClient(url, token)

            val battery = getBatteryInfo(appContext)
            val currentAppDetector = CurrentAppDetector(appContext)
            val musicProvider = MusicMetadataProvider(appContext)
            val music = detectMusic(musicProvider)
            val currentApp = detectCurrentApp(
                intervalSec = intervalSec,
                detector = currentAppDetector
            )
            val appId = resolveAppId(
                currentAppPackage = currentApp?.packageName,
                musicPackage = music?.appPackage,
                interactive = isDeviceInteractive(appContext)
            )

            val result = client.reportApp(
                appId = appId,
                windowTitle = "",
                batteryPercent = battery?.first,
                batteryCharging = battery?.second,
                musicTitle = music?.title,
                musicArtist = music?.artist,
                musicApp = music?.appName,
            )

            if (result.isSuccess) {
                val summary = buildString {
                    append("已上报 ")
                    append(appId)
                    currentApp?.let { append(" (${it.source.name})") }
                    music?.title?.takeIf { it.isNotBlank() }?.let {
                        append(" · ")
                        append(it)
                    }
                }
                DebugLog.log("心跳", summary)
                Log.i(TAG, summary)
                HeartbeatRunResult(
                    summary = summary,
                    appId = appId,
                    reported = true
                )
            } else {
                val summary = "上报失败: ${result.exceptionOrNull()?.message ?: "未知错误"}"
                DebugLog.log("心跳", summary)
                HeartbeatRunResult(summary = summary, appId = appId)
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            val summary = "上报异常: ${e.message ?: e.javaClass.simpleName}"
            DebugLog.log("心跳", summary)
            Log.e(TAG, summary, e)
            HeartbeatRunResult(summary = summary)
        } finally {
            runCatching { client?.shutdown() }
        }
    }

    private fun detectCurrentApp(
        intervalSec: Int,
        detector: CurrentAppDetector
    ) = runCatching {
        val usageWindowMs = maxOf(
            USAGE_EVENTS_LOOKBACK_FLOOR_MS,
            (intervalSec.toLong() + 30L) * 1000L
        )
        detector.detectCurrentApp(
            accessibilitySnapshotMaxAgeMs = USAGE_STATS_LOOKBACK_MS,
            usageEventsWindowMs = usageWindowMs,
            usageStatsWindowMs = USAGE_STATS_LOOKBACK_MS,
        )
    }.getOrNull()

    private fun resolveAppId(
        currentAppPackage: String?,
        musicPackage: String?,
        interactive: Boolean
    ): String {
        if (!interactive) {
            return "idle"
        }

        return currentAppPackage?.takeIf { it.isNotBlank() }
            ?: musicPackage?.takeIf { it.isNotBlank() }
            ?: "android"
    }

    private fun detectMusic(musicProvider: MusicMetadataProvider) =
        runCatching { musicProvider.getCurrentMusic() }.getOrNull()

    private fun isDeviceInteractive(context: Context): Boolean {
        val powerManager = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
        return powerManager?.isInteractive ?: true
    }

    private fun getBatteryInfo(context: Context): Pair<Int, Boolean>? {
        return try {
            val intent = context.registerReceiver(
                null,
                IntentFilter(Intent.ACTION_BATTERY_CHANGED)
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
                } else {
                    null
                }
            }
        } catch (_: Exception) {
            null
        }
    }
}
