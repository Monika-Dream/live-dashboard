package com.monika.livedashboard.agent

data class AgentSettings(
    val serverUrl: String = "",
    val token: String = "",
    val heartbeatSeconds: Int = 30,
    val consentGiven: Boolean = false,
    val reportActivity: Boolean = true,
    val reportBattery: Boolean = true,
    val autoStartOnBoot: Boolean = false,
    val isRunningEnabled: Boolean = false,
    val customRules: List<AppCustomRule> = emptyList(),
)

data class AppCustomRule(
    val packageName: String,
    val customAppName: String,
    val customDescription: String? = null,
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
    val music: MusicInfo? = null,
    val customAppName: String? = null,
    val customDescription: String? = null,
)

data class MusicInfo(
    val title: String,
    val artist: String? = null,
    val app: String? = null
)
