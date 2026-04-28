package com.monika.livedashboard.agent

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != Intent.ACTION_BOOT_COMPLETED) return

        val settings = SettingsStore(context).load()
        val shouldStart = settings.autoStartOnBoot &&
            settings.isRunningEnabled &&
            settings.consentGiven &&
            settings.reportActivity

        if (!shouldStart) return

        val serviceIntent = Intent(context, TrackingService::class.java).apply {
            action = TrackingService.ACTION_START
        }
        ContextCompat.startForegroundService(context, serviceIntent)
    }
}
