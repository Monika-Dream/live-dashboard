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
    private const val EVENT_LOOKBACK_MS = 2 * 60 * 1000L
    private const val STATS_LOOKBACK_MS = 15 * 60 * 1000L
    private const val MAX_NON_SYSTEM_STALENESS_MS = 10 * 60 * 1000L

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
        val eventStartTime = endTime - EVENT_LOOKBACK_MS

        // Prefer usage events: they are more reliable for current foreground app on many OEM ROMs.
        val fromEvents = latestForegroundFromEvents(
            context = context,
            usageStatsManager = usageStatsManager,
            startTime = eventStartTime,
            endTime = endTime
        )
        if (fromEvents != null) return fromEvents

        val startTime = endTime - STATS_LOOKBACK_MS

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

            var lastAnyPackage: String? = null
            var lastAnyTimestamp = 0L
            var lastUserPackage: String? = null
            var lastUserTimestamp = 0L

            while (events.hasNextEvent()) {
                events.getNextEvent(event)

                val packageName = event.packageName ?: continue
                if (packageName == context.packageName) continue

                val isForegroundEvent =
                    event.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND ||
                        (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
                            event.eventType == UsageEvents.Event.ACTIVITY_RESUMED)

                if (!isForegroundEvent) continue

                if (event.timeStamp >= lastAnyTimestamp) {
                    lastAnyTimestamp = event.timeStamp
                    lastAnyPackage = packageName
                }

                if (!isIgnoredForegroundPackage(context, packageName) && event.timeStamp >= lastUserTimestamp) {
                    lastUserTimestamp = event.timeStamp
                    lastUserPackage = packageName
                }
            }

            val chosenPackage: String?
            val chosenTimestamp: Long

            if (lastUserPackage != null && (endTime - lastUserTimestamp) <= MAX_NON_SYSTEM_STALENESS_MS) {
                chosenPackage = lastUserPackage
                chosenTimestamp = lastUserTimestamp
            } else if (lastAnyPackage != null) {
                chosenPackage = lastAnyPackage
                chosenTimestamp = lastAnyTimestamp
            } else if (lastUserPackage != null) {
                chosenPackage = lastUserPackage
                chosenTimestamp = lastUserTimestamp
            } else {
                chosenPackage = null
                chosenTimestamp = 0L
            }

            if (chosenPackage == null) {
                null
            } else {
                val appName = resolveAppName(context, chosenPackage)
                ForegroundAppInfo(
                    packageName = chosenPackage,
                    appName = appName,
                    timestampMs = chosenTimestamp
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

        // Launcher/system apps often steal the latest timestamp on some ROMs.
        // Prefer the most recent non-launcher app as fallback.
        return candidates.firstOrNull { !isLauncherOrSystemUi(it.packageName) } ?: top
    }

    private fun isIgnoredForegroundPackage(context: Context, packageName: String): Boolean {
        if (isLauncherOrSystemUi(packageName)) return true

        val lower = packageName.lowercase()
        if (
            lower == "com.android.settings" ||
            lower == "com.iqoo.powersaving" ||
            lower == "com.vivo.pem" ||
            lower.startsWith("com.android.permissioncontroller") ||
            lower.startsWith("com.google.android.permissioncontroller")
        ) {
            return true
        }

        val label = resolveAppName(context, packageName).lowercase()
        return label.contains("launcher") ||
            label.contains("system ui") ||
            label.contains("systemui") ||
            label.contains("桌面") ||
            label.contains("系统桌面") ||
            label.contains("设置") ||
            label.contains("电池") ||
            label.contains("电量")
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
