/*
 * 无障碍服务：监听 WINDOW_STATE_CHANGED，把前台包名快照写入 AccessibilityCurrentAppStore，
 * 并在前台应用发生变化时【立即】触发一次上报（事件驱动，带去抖）。
 *
 * 为什么上报要挂在这里而不是只靠心跳循环：MIUI/HyperOS 等厂商会冻结后台进程，
 * 心跳协程一冻就停；而被系统绑定的无障碍服务几乎不受冻结影响，事件照常送达——
 * 这是"切换应用后面板长时间不更新"问题的治本手段。心跳循环仍保留，负责
 * 电量/音乐/在线状态的兜底节拍。
 *
 * 联动：快照被 CurrentAppDetector 消费；上报复用 HeartbeatReporter 全流程。
 */
package com.monika.dashboard.service

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.content.Intent
import android.os.PowerManager
import android.os.SystemClock
import android.view.accessibility.AccessibilityEvent
import com.monika.dashboard.data.DebugLog
import com.monika.dashboard.data.SettingsStore
import com.monika.dashboard.monitor.AccessibilityCurrentAppStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull

class DashboardAccessibilityService : AccessibilityService() {

    companion object {
        /** 同一应用重复事件的静默期：期间只更新快照，不重复上报。 */
        private const val SAME_APP_SILENCE_MS = 60_000L
        /** 任意两次事件上报的最小间隔，防止快速连切时打爆服务器。 */
        private const val MIN_REPORT_GAP_MS = 3_000L
        /** 这些包名的窗口事件不值得立即上报（系统界面/输入法弹窗等噪音）。 */
        private val IGNORED_PACKAGES = setOf("com.android.systemui")
        /** WakeLock / 上报超时上限，防止异常时长期占用唤醒锁。 */
        private const val WAKELOCK_TIMEOUT_MS = 15_000L
    }

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val reportMutex = Mutex()

    @Volatile private var lastReportedPackage = ""
    @Volatile private var lastReportAt = 0L

    override fun onServiceConnected() {
        super.onServiceConnected()
        DebugLog.log("无障碍", "前台应用监听已连接")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val snapshotEvent = event ?: return
        if (snapshotEvent.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return

        val packageName = snapshotEvent.packageName?.toString()?.trim().orEmpty()
        if (packageName.isBlank()) return

        android.util.Log.i("LiveDash", "[无障碍事件] pkg=$packageName")

        AccessibilityCurrentAppStore.save(
            context = applicationContext,
            packageName = packageName,
            className = snapshotEvent.className?.toString()
        )

        maybeReportImmediately(packageName)
    }

    /**
     * 前台应用变了就立刻上报一次，绕开被厂商冻结的心跳循环。
     *
     * 关键：HyperOS 在处理完无障碍事件的那一刻会立即把进程重新冻住，异步的
     * 网络上报常常还没发完就被掐断。所以这里先抢一个 PARTIAL_WAKE_LOCK（带超时），
     * 强行让 CPU 保持唤醒直到上报完成再释放，堵住"冻结前发不完"这个洞。
     */
    private fun maybeReportImmediately(packageName: String) {
        if (packageName == applicationContext.packageName) return
        if (packageName in IGNORED_PACKAGES) return

        val now = SystemClock.elapsedRealtime()
        if (packageName == lastReportedPackage && now - lastReportAt < SAME_APP_SILENCE_MS) return
        if (now - lastReportAt < MIN_REPORT_GAP_MS) return

        val powerManager = applicationContext.getSystemService(Context.POWER_SERVICE) as? PowerManager
        val wakeLock = powerManager?.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "LiveDashboard:accessibility-report"
        )?.apply { setReferenceCounted(false) }
        // 先在事件线程（未被冻结的窗口）内点亮 WakeLock，再交给协程发请求
        runCatching { wakeLock?.acquire(WAKELOCK_TIMEOUT_MS) }

        serviceScope.launch {
            try {
                reportMutex.withLock {
                    val recheck = SystemClock.elapsedRealtime()
                    if (packageName == lastReportedPackage && recheck - lastReportAt < SAME_APP_SILENCE_MS) return@withLock
                    if (recheck - lastReportAt < MIN_REPORT_GAP_MS) return@withLock

                    val settings = SettingsStore(applicationContext)
                    if (!settings.monitoringEnabled.first()) return@withLock

                    lastReportedPackage = packageName
                    lastReportAt = SystemClock.elapsedRealtime()
                    // 上报本身再套一层超时，避免卡死时一直占着 WakeLock
                    val result = withTimeoutOrNull(WAKELOCK_TIMEOUT_MS) {
                        HeartbeatReporter.runOnce(applicationContext, settings.reportInterval.first())
                    }
                    DebugLog.log("无障碍", "切换即报：$packageName → ${result?.summary ?: "超时"}")
                }
            } catch (e: Exception) {
                DebugLog.log("无障碍", "切换上报失败: ${e.message}")
            } finally {
                runCatching { if (wakeLock?.isHeld == true) wakeLock.release() }
            }
        }
    }

    override fun onInterrupt() {
        DebugLog.log("无障碍", "前台应用监听被系统中断")
    }

    override fun onUnbind(intent: Intent?): Boolean {
        AccessibilityCurrentAppStore.clear(applicationContext)
        serviceScope.cancel()
        DebugLog.log("无障碍", "前台应用监听已断开")
        return super.onUnbind(intent)
    }
}
