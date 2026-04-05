package com.monika.dashboard.service

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.view.accessibility.AccessibilityEvent
import com.monika.dashboard.data.DebugLog
import com.monika.dashboard.monitor.AccessibilityCurrentAppStore

class DashboardAccessibilityService : AccessibilityService() {

    override fun onServiceConnected() {
        super.onServiceConnected()
        DebugLog.log("无障碍", "前台应用监听已连接")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val snapshotEvent = event ?: return
        if (snapshotEvent.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return

        val packageName = snapshotEvent.packageName?.toString()?.trim().orEmpty()
        if (packageName.isBlank()) return

        AccessibilityCurrentAppStore.save(
            context = applicationContext,
            packageName = packageName,
            className = snapshotEvent.className?.toString()
        )
    }

    override fun onInterrupt() {
        DebugLog.log("无障碍", "前台应用监听被系统中断")
    }

    override fun onUnbind(intent: Intent?): Boolean {
        AccessibilityCurrentAppStore.clear(applicationContext)
        DebugLog.log("无障碍", "前台应用监听已断开")
        return super.onUnbind(intent)
    }
}
