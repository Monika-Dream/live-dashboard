package com.monika.dashboard.realtime

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.monika.dashboard.MainActivity
import com.monika.dashboard.R
import com.monika.dashboard.data.DebugLog
import com.monika.dashboard.data.SettingsStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.net.URI
import java.util.concurrent.TimeUnit

object MessageSocketManager {
    private const val CHANNEL_ID = "visitor_messages"
    private const val NOTIFICATION_ID = 2001

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val client = OkHttpClient.Builder()
        .pingInterval(25, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.SECONDS)
        .build()

    @Volatile
    private var socket: WebSocket? = null

    @Volatile
    private var connecting = false

    fun ensureStarted(context: Context) {
        if (socket != null || connecting) return
        val appContext = context.applicationContext
        connecting = true
        scope.launch {
            val settings = SettingsStore(appContext)
            val enabled = settings.monitoringEnabled.first()
            val url = settings.serverUrl.first()
            val token = settings.getToken()
            if (!enabled || url.isBlank() || token.isNullOrBlank()) {
                connecting = false
                return@launch
            }
            runCatching {
                val wsUrl = buildWsUrl(url)
                val request = Request.Builder()
                    .url(wsUrl)
                    .addHeader("Authorization", "Bearer $token")
                    .build()
                socket = client.newWebSocket(request, Listener(appContext, url, token))
            }.onFailure {
                connecting = false
                DebugLog.log("消息", "WebSocket启动失败: ${it.message}")
            }
        }
    }

    fun stop() {
        socket?.close(1000, "disabled")
        socket = null
        connecting = false
    }

    fun notifyIncoming(context: Context, text: String) {
        createChannel(context)
        val intent = Intent(context, MainActivity::class.java)
        val pending = PendingIntent.getActivity(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("网页游客消息")
            .setContentText(text.take(120))
            .setStyle(NotificationCompat.BigTextStyle().bigText(text.take(500)))
            .setContentIntent(pending)
            .setAutoCancel(true)
            .build()
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIFICATION_ID, notification)
    }

    private fun buildWsUrl(serverUrl: String): String {
        val uri = URI(serverUrl.trimEnd('/'))
        val scheme = if (uri.scheme == "https") "wss" else "ws"
        val port = if (uri.port >= 0) ":${uri.port}" else ""
        val path = uri.path?.trimEnd('/')?.takeIf { it.isNotBlank() } ?: ""
        return "$scheme://${uri.host}$port$path/api/ws?role=device"
    }

    private fun createChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return
        nm.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                "网页游客消息",
                NotificationManager.IMPORTANCE_DEFAULT
            )
        )
    }

    private class Listener(
        private val context: Context,
        private val serverUrl: String,
        private val token: String,
    ) : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            connecting = false
            DebugLog.log("消息", "WebSocket已连接")
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            val data = runCatching { JSONObject(text) }.getOrNull() ?: return
            if (data.optString("type") != "viewer_message") return
            val message = data.optString("text").take(500)
            val messageId = data.optString("message_id")
            val viewerId = data.optString("viewer_id")
            notifyIncoming(context, message)
            if (viewerId.isNotBlank()) {
                val reply = JSONObject().apply {
                    put("type", "device_reply")
                    put("message_id", messageId)
                    put("target_viewer_id", viewerId)
                    put("text", "手机已收到消息")
                }
                webSocket.send(reply.toString())
            }
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            socket = null
            connecting = false
            DebugLog.log("消息", "WebSocket已断开")
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            socket = null
            connecting = false
            DebugLog.log("消息", "WebSocket失败: ${t.message}")
        }
    }
}
