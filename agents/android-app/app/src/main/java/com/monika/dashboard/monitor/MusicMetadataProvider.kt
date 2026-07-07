/*
 * 读取当前播放音乐（歌名/歌手/来源应用），基于 MediaSessionManager。
 * 联动：需要 DashboardNotificationListenerService 获得通知使用权后才可用；HeartbeatReporter 消费结果。
 */
package com.monika.dashboard.monitor

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import com.monika.dashboard.service.DashboardNotificationListenerService

data class MusicSnapshot(
    val title: String,
    val artist: String?,
    val appName: String,
    val appPackage: String
)

class MusicMetadataProvider(private val context: Context) {

    private val mediaSessionManager: MediaSessionManager? by lazy {
        context.getSystemService(Context.MEDIA_SESSION_SERVICE) as? MediaSessionManager
    }

    fun hasNotificationAccess(): Boolean {
        return NotificationManagerCompat
            .getEnabledListenerPackages(context)
            .contains(context.packageName)
    }

    fun getCurrentMusic(): MusicSnapshot? {
        if (!hasNotificationAccess()) return null
        val manager = mediaSessionManager ?: return null
        val listenerComponent = ComponentName(context, DashboardNotificationListenerService::class.java)
        val sessions = try {
            manager.getActiveSessions(listenerComponent)
        } catch (_: SecurityException) {
            return null
        } catch (_: Exception) {
            return null
        }

        return sessions
            .asSequence()
            .filter { isActivePlayback(it.playbackState) }
            .mapNotNull { extractSnapshot(it) }
            .firstOrNull()
    }

    private fun isActivePlayback(playbackState: PlaybackState?): Boolean {
        return when (playbackState?.state) {
            PlaybackState.STATE_PLAYING,
            PlaybackState.STATE_BUFFERING,
            PlaybackState.STATE_CONNECTING,
            PlaybackState.STATE_FAST_FORWARDING,
            PlaybackState.STATE_REWINDING,
            PlaybackState.STATE_SKIPPING_TO_NEXT,
            PlaybackState.STATE_SKIPPING_TO_PREVIOUS,
            PlaybackState.STATE_SKIPPING_TO_QUEUE_ITEM -> true
            else -> false
        }
    }

    private fun extractSnapshot(controller: MediaController): MusicSnapshot? {
        val metadata = controller.metadata ?: return null
        val title = extractTitle(metadata) ?: return null
        val artist = extractArtist(metadata)
        val packageName = controller.packageName?.trim().orEmpty()
        if (packageName.isEmpty()) return null

        return MusicSnapshot(
            title = title.take(256),
            artist = artist?.take(256),
            appName = packageName.take(64),
            appPackage = packageName
        )
    }

    private fun extractTitle(metadata: MediaMetadata): String? {
        return metadata.getString(MediaMetadata.METADATA_KEY_TITLE)
            ?.trim()
            ?.takeIf { it.isNotEmpty() }
            ?: metadata.description.title
                ?.toString()
                ?.trim()
                ?.takeIf { it.isNotEmpty() }
    }

    private fun extractArtist(metadata: MediaMetadata): String? {
        return metadata.getString(MediaMetadata.METADATA_KEY_ARTIST)
            ?.trim()
            ?.takeIf { it.isNotEmpty() }
            ?: metadata.description.subtitle
                ?.toString()
                ?.trim()
                ?.takeIf { it.isNotEmpty() }
    }

    companion object {
        fun notificationListenerSettingsIntent(): Intent =
            Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
    }
}
