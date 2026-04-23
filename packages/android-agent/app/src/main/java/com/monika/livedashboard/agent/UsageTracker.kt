package com.monika.livedashboard.agent

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStats
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Process
import android.provider.Settings

object UsageTracker {
    fun hasUsageStatsPermission(context: Context): Boolean {
        val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = appOps.checkOpNoThrow(
            AppOpsManager.OPSTR_GET_USAGE_STATS,
            Process.myUid(),
            context.packageName
        )
        return mode == AppOpsManager.MODE_ALLOWED
    }

    fun openUsageAccessSettings(context: Context) {
        val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    }

    fun currentForegroundApp(context: Context): ForegroundAppInfo? {
        val usageStatsManager =
            context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val endTime = System.currentTimeMillis()
        val eventStartTime = endTime - 60 * 1000

        // Prefer usage events: they are more reliable for current foreground app on many OEM ROMs.
        val fromEvents = latestForegroundFromEvents(
            context = context,
            usageStatsManager = usageStatsManager,
            startTime = eventStartTime,
            endTime = endTime
        )
        if (fromEvents != null) return fromEvents

        val startTime = endTime - 5 * 60 * 1000

        val stats = usageStatsManager.queryUsageStats(
            UsageStatsManager.INTERVAL_DAILY,
            startTime,
            endTime
        )

        val candidates = stats
            .filter { it.lastTimeUsed > 0L }
            .filter { it.packageName != context.packageName }
            .sortedByDescending(UsageStats::getLastTimeUsed)

        val recent = pickBestCandidate(candidates) ?: return null

        val appName = resolveAppName(context, recent.packageName)
        return ForegroundAppInfo(
            packageName = recent.packageName,
            appName = appName,
            timestampMs = recent.lastTimeUsed
        )
    }

    private fun latestForegroundFromEvents(
        context: Context,
        usageStatsManager: UsageStatsManager,
        startTime: Long,
        endTime: Long
    ): ForegroundAppInfo? {
        return try {
            val events = usageStatsManager.queryEvents(startTime, endTime)
            val event = UsageEvents.Event()

            var lastPackage: String? = null
            var lastTimestamp = 0L

            while (events.hasNextEvent()) {
                events.getNextEvent(event)

                val packageName = event.packageName ?: continue
                if (packageName == context.packageName) continue

                val isForegroundEvent =
                    event.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND ||
                        (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
                            event.eventType == UsageEvents.Event.ACTIVITY_RESUMED)

                if (!isForegroundEvent) continue

                if (event.timeStamp >= lastTimestamp) {
                    lastTimestamp = event.timeStamp
                    lastPackage = packageName
                }
            }

            if (lastPackage == null) {
                null
            } else {
                val appName = resolveAppName(context, lastPackage)
                ForegroundAppInfo(
                    packageName = lastPackage,
                    appName = appName,
                    timestampMs = lastTimestamp
                )
            }
        } catch (_: Exception) {
            null
        }
    }

    private fun pickBestCandidate(candidates: List<UsageStats>): UsageStats? {
        if (candidates.isEmpty()) return null

        val top = candidates.first()
        if (!isLauncherOrSystemUi(top.packageName)) return top

        // If launcher is slightly newer than a real app, prefer the real app.
        val alternative = candidates.firstOrNull {
            !isLauncherOrSystemUi(it.packageName) &&
                (top.lastTimeUsed - it.lastTimeUsed) <= 30_000
        }

        return alternative ?: top
    }

    private fun isLauncherOrSystemUi(packageName: String): Boolean {
        val lower = packageName.lowercase()
        return lower == "com.android.systemui" ||
            lower == "com.miui.home" ||
            lower == "com.google.android.apps.nexuslauncher" ||
            lower == "com.bbk.launcher2" ||
            lower == "com.vivo.launcher" ||
            lower.startsWith("com.android.launcher") ||
            lower.startsWith("com.vivo.launcher") ||
            lower.startsWith("com.bbk.launcher") ||
            lower.startsWith("com.huawei.android.launcher") ||
            lower.startsWith("com.sec.android.app.launcher") ||
            lower.startsWith("com.oppo.launcher") ||
            lower.startsWith("com.oneplus.launcher")
    }

    private fun resolveAppName(context: Context, packageName: String): String {
        return try {
            val appInfo = context.packageManager.getApplicationInfo(packageName, 0)
            context.packageManager.getApplicationLabel(appInfo).toString()
        } catch (_: Exception) {
            packageName
        }
    }
}
