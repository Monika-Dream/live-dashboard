/*
 * 后端 HTTP 客户端：POST /api/report（心跳/前台应用）、POST /api/health-data（健康数据）、GET /api/health（连通性）。
 * 联动：复用 DashboardApp.httpClient；token/地址来自 SettingsStore。上报的是原始包名，映射在服务端完成。
 */
package com.monika.dashboard.network

import com.monika.dashboard.DashboardApp
import com.monika.dashboard.isAllowedDashboardUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.time.Instant

/**
 * 负责向后端上报活动和健康数据。
 * 所有方法都是同步 IO，只能在后台线程中调用。
 *
 * 复用 [DashboardApp.httpClient] 共享连接池，不再每次创建/销毁 OkHttpClient。
 */
class ReportClient(
    private val serverUrl: String,
    private val token: String,
    private val client: OkHttpClient = DashboardApp.httpClient
) {
    init {
        require(isAllowedDashboardUrl(serverUrl)) {
            "Only HTTPS or local/private HTTP allowed"
        }
    }

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
            put("timestamp", Instant.now().toString())

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

    data class HealthRecord(
        val type: String,
        val value: Double,
        val unit: String,
        val timestamp: String,
        val endTime: String? = null
    )
}
