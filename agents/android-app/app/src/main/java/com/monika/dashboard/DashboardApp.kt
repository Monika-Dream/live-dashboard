package com.monika.dashboard

import android.app.Application
import androidx.work.Configuration
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

class DashboardApp : Application(), Configuration.Provider {

    companion object {
        /**
         * Application-scoped OkHttpClient，所有网络调用共享同一个连接池和线程池。
         * 使用 lazy 保证即使 ContentProvider / WorkManager 早于 onCreate() 访问也不会崩溃。
         */
        val httpClient: OkHttpClient by lazy {
            OkHttpClient.Builder()
                .connectTimeout(10, TimeUnit.SECONDS)
                .writeTimeout(10, TimeUnit.SECONDS)
                .readTimeout(10, TimeUnit.SECONDS)
                .build()
        }
    }

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
