package com.monika.dashboard.network

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.URI
import java.util.concurrent.TimeUnit

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
        musicTitle: String? = null,
        musicArtist: String? = null,
        musicApp: String? = null
    ): Result<Unit> {
        val body = JSONObject().apply {
            put("app_id", appId)
            put("window_title", windowTitle)
            put("timestamp", System.currentTimeMillis())

            val extra = JSONObject()
            batteryPercent?.let { extra.put("battery_percent", it) }
            batteryCharging?.let { extra.put("battery_charging", it) }

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
        if (records.isEmpty()) return Result.success(Unit)

        val chunkSize = 500
        var successCount = 0
        var failureCount = 0

        for (chunk in records.chunked(chunkSize)) {
            val body = JSONObject().apply {
                val arr = JSONArray()
                for (record in chunk) {
                    if (record.value.isNaN() || record.value.isInfinite()) continue
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

            val result = post("${serverUrl.trimEnd('/')}/api/health-data", body)
            if (result.isSuccess) {
                successCount += chunk.size
            } else {
                failureCount += chunk.size
                if (failureCount == chunk.size) {
                    return result
                }
            }
        }

        return if (failureCount == 0) Result.success(Unit)
        else Result.failure(IOException("部分批次失败: $failureCount/$successCount"))
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
}
