package com.monika.livedashboard.agent

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

class ServiceWatchdogReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != ACTION_WATCHDOG) return

        val store = SettingsStore(context)
        val settings = store.load()
        val shouldStart = settings.isRunningEnabled &&
            settings.consentGiven &&
            settings.reportActivity &&
            settings.serverUrl.isNotBlank() &&
            settings.token.isNotBlank()

        if (!shouldStart) return

        val serviceIntent = Intent(context, TrackingService::class.java).apply {
            action = TrackingService.ACTION_START
        }

        runCatching {
            ContextCompat.startForegroundService(context, serviceIntent)
            store.appendLog("看门狗触发：已尝试恢复监听服务")
        }
    }

    companion object {
        const val ACTION_WATCHDOG = "com.monika.livedashboard.agent.action.WATCHDOG"
    }
}
