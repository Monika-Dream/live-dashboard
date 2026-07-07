/*
 * 前台应用检测，三级回退：无障碍快照（≤2 分钟）→ UsageEvents → UsageStats。
 * 联动：快照由 DashboardAccessibilityService 写入 AccessibilityCurrentAppStore；HeartbeatReporter 消费检测结果。
 */
package com.monika.dashboard.monitor

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Process
import android.provider.Settings
import com.monika.dashboard.service.DashboardAccessibilityService

data class CurrentAppSnapshot(
    val packageName: String,
    val source: Source
) {
    enum class Source {
        ACCESSIBILITY,
        USAGE_EVENTS,
        USAGE_STATS
    }
}

class CurrentAppDetector(private val context: Context) {

    private val usageStatsManager: UsageStatsManager? by lazy {
        context.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
    }

    fun hasUsageAccess(): Boolean {
        val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as? AppOpsManager ?: return false
        val mode = appOps.checkOpNoThrow(
            AppOpsManager.OPSTR_GET_USAGE_STATS,
            Process.myUid(),
            context.packageName
        )
        if (mode == AppOpsManager.MODE_ALLOWED) return true

        // 某些系统即使用户已经授权，AppOps 这里也可能短时间内不给出 MODE_ALLOWED。
        // 这时退一步用 UsageStats 实际探测一次，避免把“已授权但状态未同步”误判成未授权。
        return hasUsageDataAccess()
    }

    fun hasAccessibilityAccess(): Boolean {
        val enabled = Settings.Secure.getInt(
            context.contentResolver,
            Settings.Secure.ACCESSIBILITY_ENABLED,
            0
        ) == 1
        if (!enabled) return false

        val expectedComponent = ComponentName(context, DashboardAccessibilityService::class.java)
        val enabledServices = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ).orEmpty()

        return enabledServices
            .split(':')
            .mapNotNull { ComponentName.unflattenFromString(it) }
            .any { it == expectedComponent }
    }

    fun detectCurrentApp(
        accessibilitySnapshotMaxAgeMs: Long = 12 * 60 * 60 * 1000L,
        usageEventsWindowMs: Long = 2 * 60 * 1000L,
        usageStatsWindowMs: Long = 12 * 60 * 60 * 1000L
    ): CurrentAppSnapshot? {
        detectFromAccessibility(accessibilitySnapshotMaxAgeMs)?.let { return it }
        if (!hasUsageAccess()) return null
        detectFromUsageEvents(usageEventsWindowMs)?.let { return it }
        detectFromUsageStats(usageStatsWindowMs)?.let { return it }
        return null
    }

    private fun detectFromAccessibility(maxAgeMs: Long): CurrentAppSnapshot? {
        if (!hasAccessibilityAccess()) return null
        val snapshot = AccessibilityCurrentAppStore.read(context) ?: return null
        val ageMs = System.currentTimeMillis() - snapshot.timestampMs
        if (ageMs > maxAgeMs) return null
        if (snapshot.packageName == context.packageName) return null

        return buildSnapshot(
            snapshot.packageName,
            CurrentAppSnapshot.Source.ACCESSIBILITY
        )
    }

    private fun detectFromUsageEvents(lookbackMs: Long): CurrentAppSnapshot? {
        val manager = usageStatsManager ?: return null
        val end = System.currentTimeMillis()
        val start = end - lookbackMs
        val events = manager.queryEvents(start, end)
        val event = UsageEvents.Event()

        var bestPackage: String? = null
        var bestTimestamp = Long.MIN_VALUE

        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            val packageName = event.packageName?.toString()?.trim().orEmpty()
            if (packageName.isEmpty() || packageName == context.packageName) continue
            if (!isForegroundEvent(event)) continue
            if (event.timeStamp >= bestTimestamp) {
                bestPackage = packageName
                bestTimestamp = event.timeStamp
            }
        }

        return bestPackage?.let {
            buildSnapshot(it, CurrentAppSnapshot.Source.USAGE_EVENTS)
        }
    }

    private fun detectFromUsageStats(lookbackMs: Long): CurrentAppSnapshot? {
        val manager = usageStatsManager ?: return null
        val end = System.currentTimeMillis()
        val start = end - lookbackMs
        val stats = manager.queryUsageStats(
            UsageStatsManager.INTERVAL_BEST,
            start,
            end
        )

        val bestPackage = stats
            .orEmpty()
            .asSequence()
            .filter { it.packageName != context.packageName }
            .filter { latestVisibleTimestamp(it) > 0L }
            .maxByOrNull { latestVisibleTimestamp(it) }
            ?.packageName

        return bestPackage?.let {
            buildSnapshot(it, CurrentAppSnapshot.Source.USAGE_STATS)
        }
    }

    private fun hasUsageDataAccess(): Boolean {
        val manager = usageStatsManager ?: return false
        val end = System.currentTimeMillis()
        val start = end - 6 * 60 * 60 * 1000L
        val stats = manager.queryUsageStats(
            UsageStatsManager.INTERVAL_BEST,
            start,
            end
        )

        return stats.orEmpty().any {
            it.packageName != context.packageName && latestVisibleTimestamp(it) > 0L
        }
    }

    private fun latestVisibleTimestamp(stats: android.app.usage.UsageStats): Long {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            maxOf(stats.lastTimeUsed, stats.lastTimeVisible)
        } else {
            stats.lastTimeUsed
        }
    }

    private fun buildSnapshot(
        packageName: String,
        source: CurrentAppSnapshot.Source
    ): CurrentAppSnapshot {
        return CurrentAppSnapshot(
            packageName = packageName,
            source = source
        )
    }

    private fun isForegroundEvent(event: UsageEvents.Event): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            event.eventType == UsageEvents.Event.ACTIVITY_RESUMED
        } else {
            @Suppress("DEPRECATION")
            event.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND
        }
    }

    companion object {
        fun usageAccessSettingsIntent(): Intent =
            Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }

        fun accessibilitySettingsIntent(): Intent =
            Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
    }
}
