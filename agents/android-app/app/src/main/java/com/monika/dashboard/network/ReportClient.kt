package com.monika.dashboard.network

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.URI
import java.time.Instant
import java.util.concurrent.TimeUnit
import com.monika.dashboard.system.LocationSnapshot
import com.monika.dashboard.system.SystemSnapshot

/**
 * HTTP client for reporting app activity and health data.
 * All methods perform synchronous IO — call from background threads only.
 */
class ReportClient(
    private val serverUrl: String,
    private val token: String
) {
    init {
        val uri = URI(serverUrl)
        val scheme = uri.scheme ?: ""
        val host = uri.host ?: ""
        require(
            scheme == "https" ||
            (scheme == "http" && (host == "localhost" || host == "127.0.0.1"))
        ) { "Only HTTPS or http://localhost allowed" }
    }
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .writeTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()

    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    fun reportApp(
        appId: String,
        windowTitle: String,
        batteryPercent: Int? = null,
        batteryCharging: Boolean? = null,
        networkConnected: Boolean? = null,
        vpnActive: Boolean? = null,
        vpnName: String? = null,
        location: LocationSnapshot? = null,
        snapshot: SystemSnapshot? = null,
        musicTitle: String? = null,
        musicArtist: String? = null,
        musicApp: String? = null
    ): Result<Unit> {
        val body = JSONObject().apply {
            put("app_id", appId)
            put("window_title", windowTitle)
            put("timestamp", Instant.now().toString())

            val extra = JSONObject()
            batteryPercent?.let { extra.put("battery_percent", it) }
            batteryCharging?.let { extra.put("battery_charging", it) }
            val device = JSONObject()
            networkConnected?.let { device.put("network_connected", it) }
            vpnActive?.let { device.put("vpn_active", it) }
            vpnName?.let { device.put("vpn_name", it.take(64)) }
            snapshot?.let {
                device.put("capability_mode", it.capabilityMode)
                device.put("last_sample_at", Instant.ofEpochMilli(it.sampledAt).toString())
            }
            if (device.length() > 0) extra.put("device", device)

            location?.let { loc ->
                extra.put("location", JSONObject().apply {
                    put("latitude", loc.latitude)
                    put("longitude", loc.longitude)
                    loc.accuracyMeters?.let { put("accuracy_m", it.toDouble()) }
                    loc.provider?.let { put("provider", it.take(64)) }
                    put("recorded_at", Instant.ofEpochMilli(loc.recordedAt).toString())
                })
            }

            snapshot?.foreground?.let { fg ->
                val foreground = JSONObject()
                fg.packageName?.let { foreground.put("package_name", it.take(64)) }
                fg.appName?.let { foreground.put("app_name", it.take(64)) }
                fg.activity?.let { foreground.put("activity", it.take(256)) }
                foreground.put("source", fg.source)
                foreground.put("confidence", fg.confidence.coerceIn(0.0, 1.0))
                if (foreground.length() > 0) extra.put("foreground", foreground)
            }

            snapshot?.input?.let { inputInfo ->
                val input = JSONObject()
                inputInfo.inputActive?.let { input.put("input_active", it) }
                inputInfo.isTyping?.let { input.put("is_typing", it) }
                input.put("source", inputInfo.source)
                if (input.length() > 0) extra.put("input", input)
            }

            snapshot?.media?.let { mediaInfo ->
                val media = JSONObject()
                mediaInfo.playing?.let { media.put("playing", it) }
                mediaInfo.title?.let { media.put("title", it.take(256)) }
                mediaInfo.artist?.let { media.put("artist", it.take(256)) }
                mediaInfo.app?.let { media.put("app", it.take(64)) }
                mediaInfo.state?.let { media.put("state", it.take(64)) }
                media.put("source", mediaInfo.source)
                if (media.length() > 0) extra.put("media", media)
            }

            if (musicTitle != null) {
                val music = JSONObject()
                music.put("title", musicTitle.take(256))
                musicArtist?.let { music.put("artist", it.take(256)) }
                musicApp?.let { music.put("app", it.take(64)) }
                extra.put("music", music)
            }

            if (extra.length() > 0) {
                put("extra", extra)
            }
        }

        return post("${serverUrl.trimEnd('/')}/api/report", body)
    }

    fun reportHealthData(records: List<HealthRecord>): Result<Unit> {
        val body = JSONObject().apply {
            val arr = JSONArray()
            for (record in records) {
                arr.put(JSONObject().apply {
                    put("type", record.type)
                    put("value", record.value)
                    put("unit", record.unit)
                    put("timestamp", record.timestamp)
                    if (record.endTime != null) {
                        put("end_time", record.endTime)
                    }
                })
            }
            put("records", arr)
        }

        return post("${serverUrl.trimEnd('/')}/api/health-data", body)
    }

    fun testConnection(): Result<Unit> {
        val request = Request.Builder()
            .url("${serverUrl.trimEnd('/')}/api/health")
            .addHeader("Authorization", "Bearer $token")
            .get()
            .build()

        return try {
            val response = client.newCall(request).execute()
            response.use {
                if (it.isSuccessful) Result.success(Unit)
                else Result.failure(IOException("HTTP ${it.code}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    fun fetchMessages(): Result<List<DeviceMessage>> {
        val request = Request.Builder()
            .url("${serverUrl.trimEnd('/')}/api/messages")
            .addHeader("Authorization", "Bearer $token")
            .get()
            .build()

        return try {
            val response = client.newCall(request).execute()
            response.use {
                if (!it.isSuccessful) return Result.failure(IOException("HTTP ${it.code}"))
                val body = it.body?.string().orEmpty()
                val arr = JSONObject(body).optJSONArray("messages") ?: JSONArray()
                val messages = buildList {
                    for (i in 0 until arr.length()) {
                        val item = arr.optJSONObject(i) ?: continue
                        add(
                            DeviceMessage(
                                id = item.optString("id"),
                                viewerId = item.optString("viewer_id"),
                                text = item.optString("text"),
                            )
                        )
                    }
                }
                Result.success(messages)
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    fun replyToMessage(messageId: String, viewerId: String, text: String): Result<Unit> {
        val body = JSONObject().apply {
            put("message_id", messageId)
            put("target_viewer_id", viewerId)
            put("text", text.take(500))
        }
        return post("${serverUrl.trimEnd('/')}/api/messages/reply", body)
    }

    private fun post(url: String, body: JSONObject): Result<Unit> {
        val request = Request.Builder()
            .url(url)
            .addHeader("Authorization", "Bearer $token")
            .addHeader("Content-Type", "application/json")
            .post(body.toString().toRequestBody(jsonMediaType))
            .build()

        return try {
            val response = client.newCall(request).execute()
            response.use {
                if (it.isSuccessful || it.code == 409) Result.success(Unit)
                else Result.failure(IOException("HTTP ${it.code}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    fun shutdown() {
        client.dispatcher.executorService.shutdown()
        client.connectionPool.evictAll()
    }

    data class HealthRecord(
        val type: String,
        val value: Double,
        val unit: String,
        val timestamp: String,
        val endTime: String? = null
    )

    data class DeviceMessage(
        val id: String,
        val viewerId: String,
        val text: String,
    )
}
