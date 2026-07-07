package com.monika.dashboard.service

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.SystemClock
import com.monika.dashboard.data.DebugLog
import com.monika.dashboard.data.SettingsStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * 国产 ROM（MIUI/HyperOS、EMUI 等）会绕开标准调度直接杀后台，WorkManager 的
 * 自续期经常被推迟到 Doze 维护窗口才放行。这里用 AlarmManager 看门狗补刀：
 * 心跳服务活着时不断给自己续闹钟，服务被杀后闹钟照常触发，把服务重新拉起。
 * 同时兼任开机自启（BOOT_COMPLETED 是后台启动前台服务的官方豁免场景）。
 *
 * 看门狗 + 划卡/被杀快速恢复的思路借鉴自 @nmb1337 在 PR #37 中的
 * TrackingService/ServiceWatchdogReceiver 实现，特此致谢。本实现在其
 * 基础上补充了 Android 12+ 后台禁止启动前台服务时的 Worker 回退路径。
 */
class ServiceWatchdogReceiver : BroadcastReceiver() {

    companion object {
        const val ACTION_WATCHDOG = "com.monika.dashboard.action.WATCHDOG"
        private const val REQUEST_CODE = 3001

        /** 被划卡/被杀后的快速恢复延迟。 */
        const val RECOVERY_DELAY_MS = 15_000L
        /** 正常运行时的兜底延迟下限。 */
        const val MIN_WATCHDOG_DELAY_MS = 90_000L

        private fun watchdogIntent(context: Context): PendingIntent =
            PendingIntent.getBroadcast(
                context,
                REQUEST_CODE,
                Intent(context, ServiceWatchdogReceiver::class.java)
                    .setAction(ACTION_WATCHDOG),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

        fun schedule(context: Context, delayMs: Long) {
            val alarmManager = context.getSystemService(AlarmManager::class.java) ?: return
            alarmManager.setAndAllowWhileIdle(
                AlarmManager.ELAPSED_REALTIME_WAKEUP,
                SystemClock.elapsedRealtime() + delayMs,
                watchdogIntent(context)
            )
        }

        fun cancel(context: Context) {
            context.getSystemService(AlarmManager::class.java)
                ?.cancel(watchdogIntent(context))
        }
    }

    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action
        if (action != ACTION_WATCHDOG && action != Intent.ACTION_BOOT_COMPLETED) return

        val appContext = context.applicationContext
        val pendingResult = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val settings = SettingsStore(appContext)
                if (!settings.monitoringEnabled.first()) return@launch

                try {
                    DashboardHeartbeatService.start(appContext)
                    DebugLog.log("看门狗", "已重新拉起心跳服务（$action）")
                } catch (e: Exception) {
                    // Android 12+ 禁止从后台广播启动前台服务
                    // （ForegroundServiceStartNotAllowedException）。退回 WorkManager
                    // 单次任务保底：心跳照走，用户下次打开 App 时前台服务自然恢复。
                    HeartbeatWorker.schedule(appContext, settings.reportInterval.first())
                    DebugLog.log("看门狗", "前台服务被系统拒绝，已退回 Worker 兜底: ${e.message}")
                }
            } catch (_: Exception) {
                // 读配置失败等极端情况：什么都不做，等下一次触发
            } finally {
                pendingResult.finish()
            }
        }
    }
}
