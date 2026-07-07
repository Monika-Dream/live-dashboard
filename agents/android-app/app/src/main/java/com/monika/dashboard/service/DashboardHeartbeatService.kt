package com.monika.dashboard.service

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.monika.dashboard.MainActivity
import com.monika.dashboard.R
import com.monika.dashboard.data.DebugLog
import com.monika.dashboard.data.SettingsStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * 监听开启后改由前台服务常驻，避免把高频心跳硬塞给 WorkManager。
 * 这样会多一个常驻通知，但后台执行会比“定时 worker 自续期”稳定得多。
 */
class DashboardHeartbeatService : Service() {

    companion object {
        private const val ACTION_START = "com.monika.dashboard.action.START_HEARTBEAT"
        private const val NOTIFICATION_CHANNEL_ID = "dashboard_heartbeat"
        private const val NOTIFICATION_ID = 2001

        fun start(context: Context) {
            HeartbeatWorker.cancel(context)
            ContextCompat.startForegroundService(
                context,
                Intent(context, DashboardHeartbeatService::class.java).apply {
                    action = ACTION_START
                }
            )
        }

        fun stop(context: Context) {
            HeartbeatWorker.cancel(context)
            ServiceWatchdogReceiver.cancel(context)
            context.stopService(Intent(context, DashboardHeartbeatService::class.java))
        }
    }

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var loopJob: Job? = null

    /** 循环最近一次读到的监听开关，onDestroy/onTaskRemoved 里没法挂起读 DataStore。 */
    @Volatile
    private var monitoringActive = false

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startAsForeground(
            statusText = "后台监听准备中",
            intervalSec = HeartbeatWorker.DEFAULT_INTERVAL_SECONDS
        )
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startAsForeground(
            statusText = "后台监听运行中",
            intervalSec = HeartbeatWorker.DEFAULT_INTERVAL_SECONDS
        )
        restartLoop()
        return START_STICKY
    }

    override fun onDestroy() {
        loopJob?.cancel()
        serviceScope.cancel()
        if (monitoringActive) {
            // 被系统/厂商杀掉而非用户主动关闭 → 排短闹钟自救
            ServiceWatchdogReceiver.schedule(applicationContext, 20_000L)
            DebugLog.log("心跳服务", "服务被销毁，已安排看门狗恢复")
        } else {
            DebugLog.log("心跳服务", "后台监听服务已停止")
        }
        super.onDestroy()
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        // MIUI/HyperOS 划卡 = 强杀进程，这里排一个 15s 的快速恢复闹钟
        if (monitoringActive) {
            ServiceWatchdogReceiver.schedule(
                applicationContext,
                ServiceWatchdogReceiver.RECOVERY_DELAY_MS
            )
            DebugLog.log("心跳服务", "任务被移除，已安排看门狗恢复")
        }
        super.onTaskRemoved(rootIntent)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun restartLoop() {
        loopJob?.cancel()
        loopJob = serviceScope.launch {
            val settings = SettingsStore(applicationContext)
            while (true) {
                val enabled = settings.monitoringEnabled.first()
                monitoringActive = enabled
                if (!enabled) {
                    ServiceWatchdogReceiver.cancel(applicationContext)
                    stopSelf()
                    break
                }

                val intervalSec = settings.reportInterval.first()
                    .coerceIn(
                        HeartbeatWorker.MIN_INTERVAL_SECONDS,
                        HeartbeatWorker.MAX_INTERVAL_SECONDS
                    )

                // 每轮都给看门狗续命：服务被厂商杀掉后，这个已排好的闹钟
                // 会在最多 max(90s, 3×间隔) 内把服务重新拉起来
                ServiceWatchdogReceiver.schedule(
                    applicationContext,
                    maxOf(
                        ServiceWatchdogReceiver.MIN_WATCHDOG_DELAY_MS,
                        intervalSec * 3_000L
                    )
                )

                val result = HeartbeatReporter.runOnce(applicationContext, intervalSec)
                updateNotification(result.summary, intervalSec)
                delay(intervalSec * 1000L)
            }
        }
    }

    private fun startAsForeground(statusText: String, intervalSec: Int) {
        val notification = buildNotification(statusText, intervalSec)
        ServiceCompat.startForeground(
            this,
            NOTIFICATION_ID,
            notification,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            } else {
                0
            }
        )
    }

    private fun updateNotification(statusText: String, intervalSec: Int) {
        NotificationManagerCompat.from(this).notify(
            NOTIFICATION_ID,
            buildNotification(statusText, intervalSec)
        )
    }

    private fun buildNotification(statusText: String, intervalSec: Int) =
        NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(getString(R.string.heartbeat_notification_title))
            .setContentText(statusText)
            .setStyle(
                NotificationCompat.BigTextStyle().bigText(
                    "$statusText\n心跳间隔 ${intervalSec} 秒\n如需关闭，请回到 App 内点击“关闭监听”。"
                )
            )
            .setContentIntent(mainActivityPendingIntent())
            .setOnlyAlertOnce(true)
            .setOngoing(true)
            .build()

    private fun mainActivityPendingIntent(): PendingIntent {
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        return PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
            },
            flags
        )
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val manager = getSystemService(NotificationManager::class.java) ?: return
        val channel = NotificationChannel(
            NOTIFICATION_CHANNEL_ID,
            getString(R.string.heartbeat_channel_name),
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = getString(R.string.heartbeat_channel_description)
        }
        manager.createNotificationChannel(channel)
    }
}
