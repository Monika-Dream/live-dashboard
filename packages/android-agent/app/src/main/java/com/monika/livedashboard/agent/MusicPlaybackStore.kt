package com.monika.livedashboard.agent

import android.app.Notification
import android.service.notification.StatusBarNotification
import java.util.concurrent.ConcurrentHashMap

object MusicPlaybackStore {
    private const val STALE_THRESHOLD_MS = 3 * 60 * 1000L

    private data class Snapshot(
        val info: MusicInfo,
        val updatedAt: Long,
    )

    private val snapshots = ConcurrentHashMap<String, Snapshot>()

    private val knownMusicPackages = setOf(
        "com.netease.cloudmusic",
        "com.tencent.qqmusic",
        "com.kugou.android",
        "com.spotify.music",
        "com.apple.android.music",
        "com.google.android.apps.youtube.music",
        "com.tencent.karaoke",
    )

    fun updateFromNotification(sbn: StatusBarNotification) {
        val notification = sbn.notification ?: return
        val extras = notification.extras ?: return

        val hasMediaSession = extras.get(Notification.EXTRA_MEDIA_SESSION) != null
        val isTransportCategory = notification.category == Notification.CATEGORY_TRANSPORT
        val knownMusicApp = knownMusicPackages.contains(sbn.packageName)
        if (!hasMediaSession && !isTransportCategory && !knownMusicApp) return

        val rawTitle = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.trim().orEmpty()
        val rawText = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()?.trim().orEmpty()
        val rawSubText = extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString()?.trim().orEmpty()

        val title = when {
            rawTitle.isNotBlank() -> rawTitle
            rawText.isNotBlank() -> rawText
            else -> "音乐播放中"
        }

        val artist = when {
            rawText.isNotBlank() && rawText != title -> rawText
            rawSubText.isNotBlank() -> rawSubText
            else -> null
        }

        snapshots[sbn.key] = Snapshot(
            info = MusicInfo(
                title = title,
                artist = artist,
                app = sbn.packageName,
            ),
            updatedAt = System.currentTimeMillis(),
        )
    }

    fun removeByKey(key: String) {
        snapshots.remove(key)
    }

    fun clear() {
        snapshots.clear()
    }

    fun current(): MusicInfo? {
        val now = System.currentTimeMillis()
        var latest: Snapshot? = null

        val iterator = snapshots.entries.iterator()
        while (iterator.hasNext()) {
            val entry = iterator.next()
            val snapshot = entry.value
            if (now - snapshot.updatedAt > STALE_THRESHOLD_MS) {
                iterator.remove()
                continue
            }
            if (latest == null || snapshot.updatedAt > latest!!.updatedAt) {
                latest = snapshot
            }
        }

        return latest?.info
    }
}
