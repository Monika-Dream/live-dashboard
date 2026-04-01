package com.monika.dashboard.media

object PackageMapper {
    private val appNames = mapOf(
        "com.netease.cloudmusic" to "网易云音乐",
        "com.tencent.qqmusic" to "QQ音乐",
        "tv.danmaku.bili" to "哔哩哔哩",
        "com.spotify.music" to "Spotify",
        "com.google.android.apps.youtube.music" to "YouTube Music"
    )

    fun toDisplayName(packageName: String?): String {
        if (packageName.isNullOrBlank()) return ""
        return appNames[packageName] ?: packageName.substringAfterLast('.').replaceFirstChar { it.uppercase() }
    }
}
