package com.monika.livedashboard.agent

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import kotlin.math.max
import kotlin.math.min

class SettingsStore(context: Context) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun load(): AgentSettings {
        val heartbeat = sanitizeHeartbeat(prefs.getInt(KEY_HEARTBEAT_SECONDS, 30))
        return AgentSettings(
            serverUrl = prefs.getString(KEY_SERVER_URL, "") ?: "",
            token = prefs.getString(KEY_TOKEN, "") ?: "",
            heartbeatSeconds = heartbeat,
            consentGiven = prefs.getBoolean(KEY_CONSENT_GIVEN, false),
            reportActivity = prefs.getBoolean(KEY_REPORT_ACTIVITY, true),
            reportBattery = prefs.getBoolean(KEY_REPORT_BATTERY, true),
            autoStartOnBoot = prefs.getBoolean(KEY_AUTO_START, false),
            isRunningEnabled = prefs.getBoolean(KEY_RUNNING_ENABLED, false),
            customRules = readCustomRules(),
        )
    }

    fun save(settings: AgentSettings) {
        prefs.edit()
            .putString(KEY_SERVER_URL, settings.serverUrl.trim())
            .putString(KEY_TOKEN, settings.token.trim())
            .putInt(KEY_HEARTBEAT_SECONDS, sanitizeHeartbeat(settings.heartbeatSeconds))
            .putBoolean(KEY_CONSENT_GIVEN, settings.consentGiven)
            .putBoolean(KEY_REPORT_ACTIVITY, settings.reportActivity)
            .putBoolean(KEY_REPORT_BATTERY, settings.reportBattery)
            .putBoolean(KEY_AUTO_START, settings.autoStartOnBoot)
            .putBoolean(KEY_RUNNING_ENABLED, settings.isRunningEnabled)
                .putString(KEY_CUSTOM_RULES, writeCustomRules(settings.customRules).toString())
            .apply()
    }

    fun setRunningEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_RUNNING_ENABLED, enabled).apply()
    }

    @Synchronized
    fun appendLog(message: String) {
        val normalized = message.replace("\n", " ").trim()
        if (normalized.isBlank()) return

        val logs = readLogsInternal()
        val timestamped = "${java.time.LocalDateTime.now().format(LOG_TIME_FORMAT)} $normalized"
        logs.add(timestamped)
        while (logs.size > MAX_LOG_ITEMS) {
            logs.removeAt(0)
        }
        writeLogsInternal(logs)
    }

    @Synchronized
    fun loadLogs(limit: Int = MAX_LOG_ITEMS): List<String> {
        val logs = readLogsInternal()
        if (limit <= 0 || logs.size <= limit) return logs
        return logs.takeLast(limit)
    }

    @Synchronized
    fun clearLogs() {
        prefs.edit().putString(KEY_LOGS, "[]").apply()
    }

    private fun readLogsInternal(): MutableList<String> {
        val raw = prefs.getString(KEY_LOGS, "[]") ?: "[]"
        return try {
            val array = JSONArray(raw)
            MutableList(array.length()) { index ->
                array.optString(index).orEmpty()
            }.filter { it.isNotBlank() }.toMutableList()
        } catch (_: Exception) {
            mutableListOf()
        }
    }

    private fun writeLogsInternal(logs: List<String>) {
        val jsonArray = JSONArray()
        logs.forEach { jsonArray.put(it) }
        prefs.edit().putString(KEY_LOGS, jsonArray.toString()).apply()
    }

    private fun readCustomRules(): List<AppCustomRule> {
        val raw = prefs.getString(KEY_CUSTOM_RULES, "[]") ?: "[]"
        return try {
            val array = JSONArray(raw)
            val rules = mutableListOf<AppCustomRule>()
            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: continue
                val packageName = item.optString("package_name").trim()
                val customAppName = item.optString("custom_app_name").trim()
                val customDescription = item.optString("custom_description").trim()

                if (packageName.isBlank() || customAppName.isBlank()) continue

                rules.add(
                    AppCustomRule(
                        packageName = packageName,
                        customAppName = customAppName,
                        customDescription = customDescription.ifBlank { null },
                    )
                )
            }
            rules
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun writeCustomRules(rules: List<AppCustomRule>): JSONArray {
        val array = JSONArray()
        rules.forEach { rule ->
            if (rule.packageName.isBlank() || rule.customAppName.isBlank()) return@forEach
            val item = org.json.JSONObject()
                .put("package_name", rule.packageName.trim())
                .put("custom_app_name", rule.customAppName.trim())
            rule.customDescription
                ?.takeIf { it.isNotBlank() }
                ?.let { item.put("custom_description", it.trim()) }
            array.put(item)
        }
        return array
    }

    private fun sanitizeHeartbeat(value: Int): Int {
        return min(50, max(10, value))
    }

    companion object {
        private const val PREFS_NAME = "live_dashboard_agent"
        private const val KEY_SERVER_URL = "server_url"
        private const val KEY_TOKEN = "token"
        private const val KEY_HEARTBEAT_SECONDS = "heartbeat_seconds"
        private const val KEY_CONSENT_GIVEN = "consent_given"
        private const val KEY_REPORT_ACTIVITY = "report_activity"
        private const val KEY_REPORT_BATTERY = "report_battery"
        private const val KEY_AUTO_START = "auto_start"
        private const val KEY_RUNNING_ENABLED = "running_enabled"
        private const val KEY_CUSTOM_RULES = "custom_rules"
        private const val KEY_LOGS = "logs"
        private const val MAX_LOG_ITEMS = 240
        private val LOG_TIME_FORMAT = java.time.format.DateTimeFormatter.ofPattern("MM-dd HH:mm:ss")
    }
}
