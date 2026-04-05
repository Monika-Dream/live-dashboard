package com.monika.dashboard.monitor

import android.content.Context

/**
 * 无障碍服务会持续收到前台窗口变化事件，这里把最近一次结果持久化下来，
 * 让前台服务和界面都能直接读取，避免只能依赖 UsageStats 的延迟数据。
 */
object AccessibilityCurrentAppStore {

    private const val PREFS_NAME = "dashboard_accessibility_store"
    private const val KEY_PACKAGE_NAME = "package_name"
    private const val KEY_CLASS_NAME = "class_name"
    private const val KEY_TIMESTAMP_MS = "timestamp_ms"

    data class Snapshot(
        val packageName: String,
        val className: String?,
        val timestampMs: Long
    )

    fun save(context: Context, packageName: String, className: String?) {
        if (packageName.isBlank()) return
        prefs(context).edit()
            .putString(KEY_PACKAGE_NAME, packageName)
            .putString(KEY_CLASS_NAME, className)
            .putLong(KEY_TIMESTAMP_MS, System.currentTimeMillis())
            .apply()
    }

    fun read(context: Context): Snapshot? {
        val prefs = prefs(context)
        val packageName = prefs.getString(KEY_PACKAGE_NAME, null)?.trim().orEmpty()
        val timestampMs = prefs.getLong(KEY_TIMESTAMP_MS, 0L)
        if (packageName.isBlank() || timestampMs <= 0L) return null

        return Snapshot(
            packageName = packageName,
            className = prefs.getString(KEY_CLASS_NAME, null),
            timestampMs = timestampMs
        )
    }

    fun clear(context: Context) {
        prefs(context).edit().clear().apply()
    }

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
}
