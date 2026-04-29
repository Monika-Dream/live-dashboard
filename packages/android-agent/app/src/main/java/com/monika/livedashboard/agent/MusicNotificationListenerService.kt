package com.monika.livedashboard.agent

import android.content.ComponentName
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

class MusicNotificationListenerService : NotificationListenerService() {
    override fun onListenerConnected() {
        super.onListenerConnected()
        activeNotifications?.forEach { sbn ->
            MusicPlaybackStore.updateFromNotification(sbn)
        }
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null) return
        MusicPlaybackStore.updateFromNotification(sbn)
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        if (sbn == null) return
        MusicPlaybackStore.removeByKey(sbn.key)
    }

    override fun onListenerDisconnected() {
        MusicPlaybackStore.clear()
        try {
            requestRebind(ComponentName(this, MusicNotificationListenerService::class.java))
        } catch (_: Exception) {
            // Ignore rebind errors; user may have revoked notification access.
        }
    }
}
