package com.monika.dashboard.media

import android.app.Notification
import android.media.session.PlaybackState
import android.service.notification.StatusBarNotification

object MediaExtractor {
    val supportedPackages = setOf(
        "com.netease.cloudmusic",
        "com.tencent.qqmusic",
        "tv.danmaku.bili",
        "com.spotify.music",
        "com.google.android.apps.youtube.music"
    )

    fun fromNotification(sbn: StatusBarNotification): MediaSnapshot? {
        if (sbn.packageName !in supportedPackages) return null

        val notification = sbn.notification ?: return null
        if (notification.category != Notification.CATEGORY_TRANSPORT && notification.extras == null) return null

        val extras = notification.extras
        val title = extras?.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.trim().orEmpty()
        val artist = extras?.getCharSequence(Notification.EXTRA_TEXT)?.toString()?.trim().orEmpty()
        val playbackState = when (notification.extras?.getInt("android.mediaSession.playbackState", -1)) {
            PlaybackState.STATE_PLAYING -> PlaybackStateEnum.PLAYING
            PlaybackState.STATE_PAUSED -> PlaybackStateEnum.PAUSED
            PlaybackState.STATE_STOPPED -> PlaybackStateEnum.STOPPED
            else -> if (title.isNotBlank()) PlaybackStateEnum.PLAYING else PlaybackStateEnum.UNKNOWN
        }

        if (title.isBlank() && artist.isBlank() && notification.category != Notification.CATEGORY_TRANSPORT) {
            return null
        }

        return MediaSnapshot(
            title = title,
            artist = artist,
            packageName = sbn.packageName,
            appName = null,
            playbackState = playbackState,
            updatedAt = System.currentTimeMillis()
        )
    }
}
