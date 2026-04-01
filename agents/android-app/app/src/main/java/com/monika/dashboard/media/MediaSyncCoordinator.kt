package com.monika.dashboard.media

import android.util.Log
import com.monika.dashboard.data.DebugLog
import com.monika.dashboard.data.SettingsStore
import com.monika.dashboard.network.ReportClient
import java.util.concurrent.Executors

object MediaSyncCoordinator {
    private const val TAG = "MediaSync"
    private val executor = Executors.newSingleThreadExecutor()
    @Volatile
    private var lastSignature: String? = null
    @Volatile
    private var lastReportTime: Long = 0
    private const val MIN_REPORT_INTERVAL_MS = 1000L

    @Volatile
    var lastSnapshot: MediaSnapshot? = null

    fun handleSnapshot(snapshot: MediaSnapshot, settings: SettingsStore) {
        lastSnapshot = snapshot
        executor.execute {
            val now = System.currentTimeMillis()
            val normalizedTitle = snapshot.title?.trim().orEmpty()
            val normalizedArtist = snapshot.artist?.trim().orEmpty()
            val normalizedApp = snapshot.appName?.trim().orEmpty()

            val signature = listOf(normalizedTitle, normalizedArtist, normalizedApp, snapshot.playbackState.name).joinToString("|")
            if (signature == lastSignature) return@execute
            if (now - lastReportTime < MIN_REPORT_INTERVAL_MS && snapshot.playbackState != PlaybackStateEnum.STOPPED) return@execute

            lastReportTime = now
            lastSignature = signature

            val hasContent = normalizedTitle.isNotBlank() || normalizedArtist.isNotBlank() || normalizedApp.isNotBlank()
            val isStop = snapshot.playbackState == PlaybackStateEnum.PAUSED || snapshot.playbackState == PlaybackStateEnum.STOPPED

            if (!hasContent && !isStop) return@execute

            val url = try { kotlinx.coroutines.runBlocking { settings.serverUrl.first() } } catch (_: Exception) { "" }
            val token = try { settings.getToken() } catch (_: Exception) { null }
            if (url.isEmpty() || token.isNullOrEmpty()) return@execute

            var client: ReportClient? = null
            try {
                client = ReportClient(url, token)
                val result = if (hasContent) {
                    client.reportApp(
                        appId = "android",
                        windowTitle = "android",
                        musicTitle = normalizedTitle,
                        musicArtist = normalizedArtist,
                        musicApp = normalizedApp
                    )
                } else {
                    client.reportApp(
                        appId = "android",
                        windowTitle = "android",
                        musicTitle = "",
                        musicArtist = "",
                        musicApp = ""
                    )
                }

                if (result.isSuccess) {
                    DebugLog.log("媒体同步", "$normalizedArtist - $normalizedTitle [$normalizedApp] 上报成功")
                    Log.i(TAG, "Media reported: $normalizedArtist - $normalizedTitle")
                } else {
                    DebugLog.log("媒体同步", "上报失败: ${result.exceptionOrNull()?.message}")
                }
            } catch (e: Exception) {
                DebugLog.log("媒体同步", "异常: ${e.message}")
                Log.e(TAG, "Media sync error", e)
            } finally {
                runCatching { client?.shutdown() }
            }
        }
    }
}
