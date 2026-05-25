package com.monika.dashboard.data

import android.content.Context
import android.content.SharedPreferences
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.*
import androidx.datastore.preferences.preferencesDataStore
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import android.net.Uri
import android.util.Log
import com.monika.dashboard.service.HeartbeatWorker
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "settings")

class SettingsStore(private val context: Context) {

    // --- Non-sensitive settings via DataStore ---

    private object Keys {
        val SERVER_URL = stringPreferencesKey("server_url")
        val REPORT_INTERVAL = intPreferencesKey("report_interval")
        val HEALTH_SYNC_INTERVAL = intPreferencesKey("health_sync_interval")
        val ENABLED_HEALTH_TYPES = stringSetPreferencesKey("enabled_health_types")
        val MONITORING_ENABLED = booleanPreferencesKey("monitoring_enabled")
        val LAST_SYNC_TIMESTAMP = longPreferencesKey("last_sync_timestamp")
        val CAPABILITY_MODE = stringPreferencesKey("capability_mode")
        val UPLOAD_LOCATION = booleanPreferencesKey("upload_location")
        val UPLOAD_VPN_STATUS = booleanPreferencesKey("upload_vpn_status")
        val UPLOAD_INPUT_STATE = booleanPreferencesKey("upload_input_state")
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

    val capabilityMode: Flow<String> = context.dataStore.data.map { prefs ->
        sanitizeCapabilityMode(prefs[Keys.CAPABILITY_MODE] ?: "normal")
    }

    val uploadLocation: Flow<Boolean> = context.dataStore.data.map { prefs ->
        prefs[Keys.UPLOAD_LOCATION] ?: false
    }

    val uploadVpnStatus: Flow<Boolean> = context.dataStore.data.map { prefs ->
        prefs[Keys.UPLOAD_VPN_STATUS] ?: false
    }

    val uploadInputState: Flow<Boolean> = context.dataStore.data.map { prefs ->
        prefs[Keys.UPLOAD_INPUT_STATE] ?: false
    }

    val lastSyncTimestamp: Flow<Long> = context.dataStore.data.map { prefs ->
        prefs[Keys.LAST_SYNC_TIMESTAMP] ?: 0L
    }

    suspend fun setServerUrl(url: String) {
        require(validateUrl(url)) { "Invalid URL: must be HTTPS or http://localhost" }
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

    suspend fun setCapabilityMode(mode: String) {
        context.dataStore.edit { it[Keys.CAPABILITY_MODE] = sanitizeCapabilityMode(mode) }
    }

    suspend fun setUploadLocation(enabled: Boolean) {
        context.dataStore.edit { it[Keys.UPLOAD_LOCATION] = enabled }
    }

    suspend fun setUploadVpnStatus(enabled: Boolean) {
        context.dataStore.edit { it[Keys.UPLOAD_VPN_STATUS] = enabled }
    }

    suspend fun setUploadInputState(enabled: Boolean) {
        context.dataStore.edit { it[Keys.UPLOAD_INPUT_STATE] = enabled }
    }

    /** Update last sync timestamp with compare-and-set (only advances forward). */
    suspend fun setLastSyncTimestamp(millis: Long) {
        context.dataStore.edit { prefs ->
            val current = prefs[Keys.LAST_SYNC_TIMESTAMP] ?: 0L
            if (millis > current) {
                prefs[Keys.LAST_SYNC_TIMESTAMP] = millis
            }
        }
    }

    // --- Sensitive token via EncryptedSharedPreferences ---

    private val encryptedPrefs: SharedPreferences? by lazy {
        try {
            val masterKeyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
            EncryptedSharedPreferences.create(
                "secure_prefs",
                masterKeyAlias,
                context,
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
            val uri = Uri.parse(trimmed)
            val scheme = uri.scheme ?: return false
            val host = uri.host ?: return false
            return when (scheme) {
                "https" -> true
                "http" -> host == "localhost" || host == "127.0.0.1"
                else -> false
            }
        }

        fun sanitizeCapabilityMode(mode: String): String =
            when (mode) {
                "root", "lsposed" -> mode
                else -> "normal"
            }
    }
}
