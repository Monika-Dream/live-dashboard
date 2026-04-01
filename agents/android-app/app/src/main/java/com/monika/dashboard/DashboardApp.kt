package com.monika.dashboard

import android.app.Application
import androidx.work.Configuration
import com.monika.dashboard.data.SettingsStore
import com.monika.dashboard.media.MediaSessionMonitor

class DashboardApp : Application(), Configuration.Provider {

    var mediaSessionMonitor: MediaSessionMonitor? = null
        private set

    override fun onCreate() {
        super.onCreate()
        val settings = SettingsStore(this)
        mediaSessionMonitor = MediaSessionMonitor(this, settings)
        mediaSessionMonitor?.start()
    }

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setMinimumLoggingLevel(
                if (BuildConfig.DEBUG) android.util.Log.DEBUG
                else android.util.Log.WARN
            )
            .build()
}
