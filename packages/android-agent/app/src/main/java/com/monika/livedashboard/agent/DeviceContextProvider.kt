package com.monika.livedashboard.agent

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioManager
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.content.ComponentName

object DeviceContextProvider {
    fun readExtras(
        context: Context,
        customAppName: String? = null,
        customDescription: String? = null,
    ): DeviceExtras {
        return DeviceExtras(
            batteryPercent = readBatteryPercent(context),
            batteryCharging = readBatteryCharging(context),
            networkType = readNetworkType(context),
            music = readMusic(context),
            customAppName = customAppName,
            customDescription = customDescription,
        )
    }

    private fun readMusic(context: Context): MusicInfo? {
        val fromNotification = MusicPlaybackStore.current()?.let { music ->
            val resolvedApp = music.app
                ?.takeIf { it.contains('.') }
                ?.let { packageName -> resolveAppName(context, packageName) }
                ?: music.app
            music.copy(app = resolvedApp)
        }
        if (fromNotification != null) {
            return fromNotification
        }

        val fromMediaSession = readFromMediaSessions(context)
        if (fromMediaSession != null) {
            return fromMediaSession
        }

        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val isMusicActive = runCatching { audioManager.isMusicActive }.getOrDefault(false)
        if (!isMusicActive) return null

        return MusicInfo(title = "音乐播放中")
    }

    private fun readFromMediaSessions(context: Context): MusicInfo? {
        val manager = context.getSystemService(MediaSessionManager::class.java) ?: return null
        val componentName = ComponentName(context, MusicNotificationListenerService::class.java)
        val sessions = runCatching { manager.getActiveSessions(componentName) }.getOrElse { return null }

        val active = sessions.firstOrNull { session -> isSessionPlaying(session) } ?: return null
        val metadata = active.metadata ?: return null

        val title = metadata.getString(android.media.MediaMetadata.METADATA_KEY_TITLE)?.trim().orEmpty()
        if (title.isBlank()) return null

        val artist = metadata.getString(android.media.MediaMetadata.METADATA_KEY_ARTIST)?.trim()
            ?.ifBlank { null }
        val appName = resolveAppName(context, active.packageName)

        return MusicInfo(
            title = title,
            artist = artist,
            app = appName,
        )
    }

    private fun isSessionPlaying(session: MediaController): Boolean {
        val state = session.playbackState?.state ?: return false
        return state == android.media.session.PlaybackState.STATE_PLAYING ||
            state == android.media.session.PlaybackState.STATE_BUFFERING
    }

    private fun resolveAppName(context: Context, packageName: String): String {
        return try {
            val appInfo = context.packageManager.getApplicationInfo(packageName, 0)
            context.packageManager.getApplicationLabel(appInfo).toString()
        } catch (_: Exception) {
            packageName
        }
    }

    private fun readBatteryPercent(context: Context): Int? {
        val intent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            ?: return null
        val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
        val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
        if (level < 0 || scale <= 0) return null
        return (level * 100) / scale
    }

    private fun readBatteryCharging(context: Context): Boolean? {
        val intent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
            ?: return null
        val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
        return status == BatteryManager.BATTERY_STATUS_CHARGING ||
            status == BatteryManager.BATTERY_STATUS_FULL
    }

    private fun readNetworkType(context: Context): String {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = cm.activeNetwork ?: return "offline"
        val capabilities = cm.getNetworkCapabilities(network) ?: return "offline"

        return when {
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
            else -> "other"
        }
    }
}
