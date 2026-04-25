package com.monika.livedashboard.agent

import android.util.Log
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.net.URI
import java.time.Instant
import java.util.concurrent.TimeUnit

object ApiReporter {
    private const val TAG = "ApiReporter"

    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .build()

    fun postConsent(settings: AgentSettings): Boolean {
        val baseUrl = normalizeBaseUrl(settings.serverUrl) ?: return false
        if (settings.token.isBlank()) return false

        val scopes = JSONArray().apply {
            if (settings.reportActivity) put("usage_stats")
            if (settings.reportBattery) put("battery")
            put("network_state")
        }

        val body = JSONObject()
            .put("consent_version", 1)
            .put("activity_reporting", settings.reportActivity)
            .put("health_reporting", false)
            .put("granted_scopes", scopes)

        val request = Request.Builder()
            .url("$baseUrl/api/consent")
            .addHeader("Authorization", "Bearer ${settings.token}")
            .addHeader("User-Agent", "live-dashboard-android-agent/1.0.0")
            .post(body.toString().toRequestBody(jsonMediaType))
            .build()

        return execute(request)
    }

    fun postReport(
        settings: AgentSettings,
        appInfo: ForegroundAppInfo,
        extras: DeviceExtras
    ): Boolean {
        val baseUrl = normalizeBaseUrl(settings.serverUrl) ?: return false
        if (settings.token.isBlank() || !settings.reportActivity) return false

        val extraJson = JSONObject()
        if (settings.reportBattery) {
            extras.batteryPercent?.let { extraJson.put("battery_percent", it) }
            extras.batteryCharging?.let { extraJson.put("battery_charging", it) }
        }
        extraJson.put("network_type", extras.networkType)
        extras.customAppName
            ?.takeIf { it.isNotBlank() }
            ?.let { extraJson.put("custom_app_name", it.take(64)) }
        extras.customDescription
            ?.takeIf { it.isNotBlank() }
            ?.let { extraJson.put("custom_description", it.take(256)) }
        extras.music?.let { music ->
            val musicJson = JSONObject()
                .put("title", music.title.take(256))
            music.artist
                ?.takeIf { it.isNotBlank() }
                ?.let { musicJson.put("artist", it.take(256)) }
            music.app
                ?.takeIf { it.isNotBlank() }
                ?.let { musicJson.put("app", it.take(64)) }
            extraJson.put("music", musicJson)
        }

        val body = JSONObject()
            .put("app_id", appInfo.packageName)
            .put("window_title", appInfo.appName)
            .put("timestamp", Instant.ofEpochMilli(appInfo.timestampMs).toString())
            .put("extra", extraJson)

        val request = Request.Builder()
            .url("$baseUrl/api/report")
            .addHeader("Authorization", "Bearer ${settings.token}")
            .addHeader("User-Agent", "live-dashboard-android-agent/1.0.0")
            .post(body.toString().toRequestBody(jsonMediaType))
            .build()

        return execute(request)
    }

    private fun execute(request: Request): Boolean {
        return try {
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    Log.w(TAG, "Request failed: ${response.code}")
                }
                response.isSuccessful
            }
        } catch (e: Exception) {
            Log.w(TAG, "Request error: ${e.message}")
            false
        }
    }

    private fun normalizeBaseUrl(raw: String): String? {
        val candidate = raw.trim().trimEnd('/')
        if (candidate.isBlank()) return null

        return try {
            val uri = URI(candidate)
            val scheme = uri.scheme?.lowercase() ?: return null
            val host = uri.host?.lowercase() ?: return null
            val isLocalhost = host == "localhost" || host == "127.0.0.1"
            if (scheme != "https" && !isLocalhost) return null
            candidate
        } catch (_: Exception) {
            null
        }
    }
}
