package com.monika.dashboard.media

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import com.monika.dashboard.data.SettingsStore

class MediaNotificationListenerService : NotificationListenerService() {
    private var mediaSessionMonitor: MediaSessionMonitor? = null
    private lateinit var settings: SettingsStore

    override fun onListenerConnected() {
        super.onListenerConnected()
        settings = SettingsStore(applicationContext)
        mediaSessionMonitor = MediaSessionMonitor(applicationContext, settings).also { it.start() }
        Log.i("MediaListener", "Listener connected, MediaSessionMonitor started")
    }

    override fun onListenerDisconnected() {
        mediaSessionMonitor?.stop()
        mediaSessionMonitor = null
        Log.i("MediaListener", "Listener disconnected")
        super.onListenerDisconnected()
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val extracted = MediaExtractor.fromNotification(sbn) ?: return
        val snapshot = extracted.copy(appName = PackageMapper.toDisplayName(extracted.packageName))
        MediaSyncCoordinator.handleSnapshot(snapshot, settings)
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification) {
        val packageName = sbn.packageName ?: return
        if (packageName !in MediaExtractor.supportedPackages) return
        val appName = PackageMapper.toDisplayName(packageName)
        MediaSyncCoordinator.handleSnapshot(
            MediaSnapshot(
                title = "",
                artist = "",
                packageName = packageName,
                appName = appName,
                playbackState = PlaybackStateEnum.STOPPED,
                updatedAt = System.currentTimeMillis()
            ),
            settings
        )
    }
}
