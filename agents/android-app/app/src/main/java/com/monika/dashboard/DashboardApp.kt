package com.monika.dashboard

import android.app.Application
import androidx.work.Configuration

class DashboardApp : Application(), Configuration.Provider {

    override fun onCreate() {
        super.onCreate()
    }

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setMinimumLoggingLevel(
                if (BuildConfig.DEBUG) android.util.Log.DEBUG
                else android.util.Log.WARN
            )
            .build()
}
