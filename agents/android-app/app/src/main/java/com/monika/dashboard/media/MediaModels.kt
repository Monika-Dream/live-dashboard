package com.monika.dashboard.media

data class MediaSnapshot(
    val title: String?,
    val artist: String?,
    val packageName: String?,
    val appName: String?,
    val playbackState: PlaybackStateEnum,
    val updatedAt: Long
)

enum class PlaybackStateEnum {
    PLAYING,
    PAUSED,
    STOPPED,
    UNKNOWN
}
