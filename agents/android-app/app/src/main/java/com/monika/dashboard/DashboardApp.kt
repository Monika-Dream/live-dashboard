package com.monika.dashboard

import android.app.Application
import androidx.work.Configuration
import com.monika.dashboard.data.SettingsStore
import com.monika.dashboard.device.ForegroundAppDetector
import com.monika.dashboard.device.ScreenStateReceiver

class DashboardApp : Application(), Configuration.Provider {

    var foregroundAppDetector: ForegroundAppDetector? = null
        private set
    var screenStateReceiver: ScreenStateReceiver? = null
        private set

    override fun onCreate() {
        super.onCreate()
        val settings = SettingsStore(this)

        // Start foreground app detector
        foregroundAppDetector = ForegroundAppDetector(this, settings)
        foregroundAppDetector?.start()

        // Start screen state receiver
        screenStateReceiver = ScreenStateReceiver(this, settings)
        screenStateReceiver?.start()
    }

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setMinimumLoggingLevel(
                if (BuildConfig.DEBUG) android.util.Log.DEBUG
                else android.util.Log.WARN
            )
            .build()
}
