/*
 * Application 入口：提供全应用共享的 OkHttpClient（连接池复用）和 WorkManager 按需初始化配置。
 * 联动：ReportClient 及各 Worker 通过 DashboardApp.httpClient 发请求；manifest 已移除默认 WorkManagerInitializer。
 */
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
