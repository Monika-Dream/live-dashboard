package com.monika.dashboard.service

import android.service.notification.NotificationListenerService
import com.monika.dashboard.data.DebugLog

class DashboardNotificationListenerService : NotificationListenerService() {

    override fun onListenerConnected() {
        super.onListenerConnected()
        DebugLog.log("通知监听", "通知访问已连接")
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        DebugLog.log("通知监听", "通知访问已断开")
    }
}
