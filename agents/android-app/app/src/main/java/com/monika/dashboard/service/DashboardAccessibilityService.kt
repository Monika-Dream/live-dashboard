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
import android.content.Intent
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

class DashboardAccessibilityService : AccessibilityService() {

    companion object {
        /** 同一应用重复事件的静默期：期间只更新快照，不重复上报。 */
        private const val SAME_APP_SILENCE_MS = 60_000L
        /** 任意两次事件上报的最小间隔，防止快速连切时打爆服务器。 */
        private const val MIN_REPORT_GAP_MS = 3_000L
        /** 这些包名的窗口事件不值得立即上报（系统界面/输入法弹窗等噪音）。 */
        private val IGNORED_PACKAGES = setOf("com.android.systemui")
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

    /** 前台应用变了就立刻上报一次，绕开被厂商冻结的心跳循环。 */
    private fun maybeReportImmediately(packageName: String) {
        if (packageName == applicationContext.packageName) return
        if (packageName in IGNORED_PACKAGES) return

        val now = SystemClock.elapsedRealtime()
        if (packageName == lastReportedPackage && now - lastReportAt < SAME_APP_SILENCE_MS) return
        if (now - lastReportAt < MIN_REPORT_GAP_MS) return

        serviceScope.launch {
            try {
                // 与并发的心跳循环互不干扰，但事件侧自身串行化
                reportMutex.withLock {
                    val recheck = SystemClock.elapsedRealtime()
                    if (packageName == lastReportedPackage && recheck - lastReportAt < SAME_APP_SILENCE_MS) return@withLock
                    if (recheck - lastReportAt < MIN_REPORT_GAP_MS) return@withLock

                    val settings = SettingsStore(applicationContext)
                    if (!settings.monitoringEnabled.first()) return@withLock

                    lastReportedPackage = packageName
                    lastReportAt = SystemClock.elapsedRealtime()
                    val result = HeartbeatReporter.runOnce(
                        applicationContext,
                        settings.reportInterval.first()
                    )
                    DebugLog.log("无障碍", "切换即报：$packageName → ${result.summary}")
                }
            } catch (e: Exception) {
                DebugLog.log("无障碍", "切换上报失败: ${e.message}")
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
