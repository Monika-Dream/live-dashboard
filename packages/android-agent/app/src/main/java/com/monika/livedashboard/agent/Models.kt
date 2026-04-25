package com.monika.livedashboard.agent

data class AgentSettings(
    val serverUrl: String = "",
    val token: String = "",
    val heartbeatSeconds: Int = 30,
    val consentGiven: Boolean = false,
    val reportActivity: Boolean = true,
    val reportBattery: Boolean = true,
    val autoStartOnBoot: Boolean = false,
    val isRunningEnabled: Boolean = false
)

data class ForegroundAppInfo(
    val packageName: String,
    val appName: String,
    val timestampMs: Long
)

data class DeviceExtras(
    val batteryPercent: Int?,
    val batteryCharging: Boolean?,
    val networkType: String,
    val music: MusicInfo? = null
)

data class MusicInfo(
    val title: String,
    val artist: String? = null,
    val app: String? = null
)
