package com.monika.livedashboard.agent

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager

object DeviceContextProvider {
    fun readExtras(context: Context): DeviceExtras {
        return DeviceExtras(
            batteryPercent = readBatteryPercent(context),
            batteryCharging = readBatteryCharging(context),
            networkType = readNetworkType(context),
            music = readMusic(context)
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

        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val isMusicActive = runCatching { audioManager.isMusicActive }.getOrDefault(false)
        if (!isMusicActive) return null

        return MusicInfo(title = "音乐播放中")
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
