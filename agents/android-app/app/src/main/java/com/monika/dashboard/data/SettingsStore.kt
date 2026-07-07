/*
 * 全应用配置单一来源：DataStore 存普通偏好，EncryptedSharedPreferences(AES256-GCM) 存上报 token。
 * 联动：所有 Screen / Service / Worker 的配置读写都走这里；地址校验依赖 ServerUrlPolicy。
 */
package com.monika.dashboard.data

import android.content.Context
import android.content.SharedPreferences
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.*
import androidx.datastore.preferences.preferencesDataStore
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import android.net.Uri
import android.util.Log
import com.monika.dashboard.isAllowedDashboardUrl
import com.monika.dashboard.service.HeartbeatWorker
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "settings")

class SettingsStore(private val context: Context) {

    // 非敏感配置走 DataStore，避免和密钥存储耦合。

    private object Keys {
        val SERVER_URL = stringPreferencesKey("server_url")
        val REPORT_INTERVAL = intPreferencesKey("report_interval")
        val HEALTH_SYNC_INTERVAL = intPreferencesKey("health_sync_interval")
        val ENABLED_HEALTH_TYPES = stringSetPreferencesKey("enabled_health_types")
        val MONITORING_ENABLED = booleanPreferencesKey("monitoring_enabled")
        val LAST_SYNC_TIMESTAMP = longPreferencesKey("last_sync_timestamp")
    }

    val serverUrl: Flow<String> = context.dataStore.data.map { prefs ->
        prefs[Keys.SERVER_URL] ?: ""
    }

    val reportInterval: Flow<Int> = context.dataStore.data.map { prefs ->
        (prefs[Keys.REPORT_INTERVAL] ?: HeartbeatWorker.DEFAULT_INTERVAL_SECONDS)
            .coerceIn(HeartbeatWorker.MIN_INTERVAL_SECONDS, HeartbeatWorker.MAX_INTERVAL_SECONDS)
    }

    val healthSyncInterval: Flow<Int> = context.dataStore.data.map { prefs ->
        prefs[Keys.HEALTH_SYNC_INTERVAL] ?: 15
    }

    val enabledHealthTypes: Flow<Set<String>> = context.dataStore.data.map { prefs ->
        prefs[Keys.ENABLED_HEALTH_TYPES] ?: emptySet()
    }

    val monitoringEnabled: Flow<Boolean> = context.dataStore.data.map { prefs ->
        prefs[Keys.MONITORING_ENABLED] ?: false
    }

    val lastSyncTimestamp: Flow<Long> = context.dataStore.data.map { prefs ->
        prefs[Keys.LAST_SYNC_TIMESTAMP] ?: 0L
    }

    suspend fun setServerUrl(url: String) {
        require(validateUrl(url)) { "Invalid URL: must be HTTPS or local/private HTTP" }
        context.dataStore.edit { it[Keys.SERVER_URL] = url.trim() }
    }

    suspend fun setReportInterval(seconds: Int) {
        context.dataStore.edit {
            it[Keys.REPORT_INTERVAL] = seconds.coerceIn(
                HeartbeatWorker.MIN_INTERVAL_SECONDS,
                HeartbeatWorker.MAX_INTERVAL_SECONDS,
            )
        }
    }

    suspend fun setHealthSyncInterval(minutes: Int) {
        context.dataStore.edit { it[Keys.HEALTH_SYNC_INTERVAL] = minutes.coerceIn(15, 60) }
    }

    suspend fun setEnabledHealthTypes(types: Set<String>) {
        context.dataStore.edit { it[Keys.ENABLED_HEALTH_TYPES] = types }
    }

    suspend fun setMonitoringEnabled(enabled: Boolean) {
        context.dataStore.edit { it[Keys.MONITORING_ENABLED] = enabled }
    }

    /** 同步游标只允许前进，避免旧任务把新游标回写覆盖。 */
    suspend fun setLastSyncTimestamp(millis: Long) {
        context.dataStore.edit { prefs ->
            val current = prefs[Keys.LAST_SYNC_TIMESTAMP] ?: 0L
            if (millis > current) {
                prefs[Keys.LAST_SYNC_TIMESTAMP] = millis
            }
        }
    }

    // 敏感 Token 单独走加密存储。

    private val encryptedPrefs: SharedPreferences? by lazy {
        try {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            EncryptedSharedPreferences.create(
                context,
                "secure_prefs",
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (e: Exception) {
            Log.e("SettingsStore", "EncryptedSharedPreferences unavailable", e)
            null
        }
    }

    val isSecureStorageAvailable: Boolean get() = encryptedPrefs != null

    fun getToken(): String? {
        val prefs = encryptedPrefs ?: return null
        return prefs.getString("token", null)
    }

    fun setToken(token: String): Boolean {
        val prefs = encryptedPrefs ?: return false
        return prefs.edit().putString("token", token).commit()
    }

    companion object {
        fun maskToken(token: String): String {
            if (token.length <= 4) return "****"
            return token.take(4) + "***"
        }

        fun validateUrl(url: String): Boolean {
            val trimmed = url.trim()
            if (trimmed.isEmpty()) return false
            if (runCatching { Uri.parse(trimmed) }.getOrNull() == null) return false
            return isAllowedDashboardUrl(trimmed)
        }
    }
}
