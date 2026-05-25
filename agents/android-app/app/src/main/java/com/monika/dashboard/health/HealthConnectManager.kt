package com.monika.dashboard.health

import android.content.Context
import android.os.Build
import android.util.Log
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.*
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.monika.dashboard.data.DebugLog
import com.monika.dashboard.network.ReportClient
import kotlinx.coroutines.withTimeout
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlin.coroutines.cancellation.CancellationException

data class BackgroundReadAvailability(
    val isAvailable: Boolean,
    val rawStatus: Int? = null,
    val errorMessage: String? = null,
)

data class HealthReadResult(
    val records: List<ReportClient.HealthRecord>,
    val attemptedTypes: Int,
    val deniedTypes: Int,
) {
    val allAttemptedTypesDenied: Boolean
        get() = attemptedTypes > 0 && deniedTypes >= attemptedTypes && records.isEmpty()
}

class HealthConnectManager(private val context: Context) {

    companion object {
        private const val TAG = "HealthConnect"
        private const val PAGE_SIZE = 1000
        private val ISO_FORMAT = DateTimeFormatter.ISO_INSTANT

        fun isAvailable(context: Context): Boolean {
            val status = HealthConnectClient.getSdkStatus(context)
            return status == HealthConnectClient.SDK_AVAILABLE
        }

        fun isInstalled(context: Context): Boolean {
            val status = HealthConnectClient.getSdkStatus(context)
            return status != HealthConnectClient.SDK_UNAVAILABLE
        }
    }

    private val client: HealthConnectClient by lazy {
        HealthConnectClient.getOrCreate(context)
    }

    /** Background read permission */
    val backgroundReadPermission: String =
        HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND

    /**
     * Android 14+ may expose Health Connect "additional access" permissions.
     * Actual background-read availability is still determined at runtime.
     */
    val needsBackgroundPermission: Boolean = Build.VERSION.SDK_INT >= 34

    /** Data read permissions only (no background permission) — for authorization UI */
    val dataReadPermissions: Set<String> = HealthDataType.entries.map { it.permission }.toSet()

    /** All read permissions the app may request (background permission only on Android 14+) */
    val allReadPermissions: Set<String> = buildSet {
        addAll(dataReadPermissions)
        if (needsBackgroundPermission) add(backgroundReadPermission)
    }

    /** Check which permissions are currently granted */
    suspend fun getGrantedPermissions(): Set<String> {
        return client.permissionController.getGrantedPermissions()
    }

    /** Permission request contract for use in Activity/Compose */
    fun createPermissionRequestContract() =
        PermissionController.createRequestPermissionResultContract()

    /** Check background-read feature availability at runtime. */
    suspend fun getBackgroundReadAvailability(): BackgroundReadAvailability {
        if (Build.VERSION.SDK_INT < 34) {
            return BackgroundReadAvailability(isAvailable = false)
        }

        return try {
            val features = client.features
            val status = features.getFeatureStatus(
                HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND
            )
            if (com.monika.dashboard.BuildConfig.DEBUG) {
                Log.i(TAG, "Background read feature status=$status on API ${Build.VERSION.SDK_INT}")
            }
            BackgroundReadAvailability(
                isAvailable = status == HealthConnectFeatures.FEATURE_STATUS_AVAILABLE,
                rawStatus = status,
            )
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.w(TAG, "Failed to query background read feature availability", e)
            BackgroundReadAvailability(
                isAvailable = false,
                errorMessage = e.message ?: e.javaClass.simpleName,
            )
        }
    }

    suspend fun isBackgroundReadSupported(): Boolean =
        getBackgroundReadAvailability().isAvailable

    suspend fun readRecords(
        enabledTypes: Set<String>,
        since: Instant,
        until: Instant = Instant.now()
    ): HealthReadResult {
        if (!since.isBefore(until)) return HealthReadResult(emptyList(), attemptedTypes = 0, deniedTypes = 0)
        val timeRange = TimeRangeFilter.between(since, until)

        // Check permissions first, only read types with granted permissions
        val granted = getGrantedPermissions()
        val grantedDataCount = dataReadPermissions.count { it in granted }
        if (com.monika.dashboard.BuildConfig.DEBUG) {
            Log.i(TAG, "Granted data permissions: $grantedDataCount/${dataReadPermissions.size}")
            Log.i(TAG, "Time range: $since .. $until")
            Log.i(TAG, "Enabled types: ${enabledTypes.size}")
        }
        DebugLog.log("健康", "已授权数据权限数: $grantedDataCount/${dataReadPermissions.size}")
        val permittedTypes = mutableListOf<HealthDataType>()
        val missingPerms = mutableListOf<String>()
        for (typeKey in enabledTypes) {
            val type = HealthDataType.fromKey(typeKey) ?: continue
            if (type.permission in granted) permittedTypes.add(type)
            else missingPerms.add(type.displayName)
        }
        if (missingPerms.isNotEmpty()) {
            DebugLog.log("健康", "缺少权限: ${missingPerms.joinToString()}，请点击「授权」")
            Log.w(TAG, "Missing permissions for: $missingPerms")
        }
        DebugLog.log("健康", "将读取 ${permittedTypes.size} 种类型")
        if (permittedTypes.isEmpty()) {
            return HealthReadResult(emptyList(), attemptedTypes = 0, deniedTypes = 0)
        }

        val allResults = mutableListOf<ReportClient.HealthRecord>()
        var securityDeniedCount = 0
        for (type in permittedTypes) {
            try {
                val results = withTimeout(15_000L) {
                    readByType(type, timeRange)
                }
                if (results.isNotEmpty()) {
                    DebugLog.log("健康", "${type.displayName}: ${results.size} 条")
                    allResults.addAll(results)
                }
            } catch (e: kotlinx.coroutines.TimeoutCancellationException) {
                DebugLog.log("健康", "${type.displayName}: 超时，跳过")
                Log.w(TAG, "Timeout reading ${type.key}")
            } catch (e: SecurityException) {
                securityDeniedCount++
                DebugLog.log("健康", "${type.displayName}: 权限被拒绝")
                Log.w(TAG, "SecurityException reading ${type.key}: ${e.message}")
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                DebugLog.log("健康", "${type.displayName}: 失败 ${e.message}")
                Log.w(TAG, "Failed to read ${type.key}: ${e.message}")
            }
        }
        if (securityDeniedCount > 0) {
            DebugLog.log("健康", "权限不足，跳过 $securityDeniedCount 种类型")
        }
        return HealthReadResult(
            records = allResults,
            attemptedTypes = permittedTypes.size,
            deniedTypes = securityDeniedCount,
        )
    }

    /** Read all records from today (local midnight to now). For foreground sync on app open. */
    suspend fun readTodayRecords(enabledTypes: Set<String>): List<ReportClient.HealthRecord> {
        val todayStart = LocalDate.now().atStartOfDay(ZoneId.systemDefault()).toInstant()
        return readRecords(enabledTypes, todayStart, Instant.now()).records
    }

    private suspend fun readByType(
        type: HealthDataType,
        timeRange: TimeRangeFilter
    ): List<ReportClient.HealthRecord> {
        return when (type) {
            HealthDataType.HEART_RATE -> readHeartRate(timeRange)
            HealthDataType.RESTING_HEART_RATE -> readRestingHeartRate(timeRange)
            HealthDataType.HEART_RATE_VARIABILITY -> readHRV(timeRange)
            HealthDataType.STEPS -> readSteps(timeRange)
            HealthDataType.DISTANCE -> readDistance(timeRange)
            HealthDataType.EXERCISE -> readExercise(timeRange)
            HealthDataType.SLEEP -> readSleep(timeRange)
            HealthDataType.OXYGEN_SATURATION -> readOxygenSaturation(timeRange)
            HealthDataType.BODY_TEMPERATURE -> readBodyTemperature(timeRange)
            HealthDataType.RESPIRATORY_RATE -> readRespiratoryRate(timeRange)
            HealthDataType.BLOOD_PRESSURE -> readBloodPressure(timeRange)
            HealthDataType.BLOOD_GLUCOSE -> readBloodGlucose(timeRange)
            HealthDataType.WEIGHT -> readWeight(timeRange)
            HealthDataType.HEIGHT -> readHeight(timeRange)
            HealthDataType.ACTIVE_CALORIES -> readActiveCalories(timeRange)
            HealthDataType.TOTAL_CALORIES -> readTotalCalories(timeRange)
            HealthDataType.HYDRATION -> readHydration(timeRange)
            HealthDataType.NUTRITION -> readNutrition(timeRange)
        }
    }

    private fun formatInstant(instant: Instant): String = ISO_FORMAT.format(instant)

    private suspend fun readHeartRate(timeRange: TimeRangeFilter): List<ReportClient.HealthRecord> {
        val response = client.readRecords(ReadRecordsRequest(HeartRateRecord::class, timeRange))
        return response.records.flatMap { record ->
            record.samples.map { sample ->
                ReportClient.HealthRecord(
                    type = "heart_rate",
                    value = sample.beatsPerMinute.toDouble(),
                    unit = "bpm",
                    timestamp = formatInstant(sample.time)
                )
            }
        }
    }

    private suspend fun readRestingHeartRate(timeRange: TimeRangeFilter): List<ReportClient.HealthRecord> {
        val response = client.readRecords(ReadRecordsRequest(RestingHeartRateRecord::class, timeRange))
        return response.records.map { record ->
            ReportClient.HealthRecord(
                type = "resting_heart_rate",
                value = record.beatsPerMinute.toDouble(),
                unit = "bpm",
                timestamp = formatInstant(record.time)
            )
        }
    }

    private suspend fun readHRV(timeRange: TimeRangeFilter): List<ReportClient.HealthRecord> {
        val response = client.readRecords(ReadRecordsRequest(HeartRateVariabilityRmssdRecord::class, timeRange))
        return response.records.map { record ->
            ReportClient.HealthRecord(
                type = "heart_rate_variability",
                value = record.heartRateVariabilityMillis,
                unit = "ms",
                timestamp = formatInstant(record.time)
            )
        }
    }

    private suspend fun readSteps(timeRange: TimeRangeFilter): List<ReportClient.HealthRecord> {
        val response = client.readRecords(ReadRecordsRequest(StepsRecord::class, timeRange))
        return response.records.map { record ->
            ReportClient.HealthRecord(
                type = "steps",
                value = record.count.toDouble(),
                unit = "count",
                timestamp = formatInstant(record.startTime),
                endTime = formatInstant(record.endTime)
            )
        }
    }

    private suspend fun readDistance(timeRange: TimeRangeFilter): List<ReportClient.HealthRecord> {
        val response = client.readRecords(ReadRecordsRequest(DistanceRecord::class, timeRange))
        return response.records.map { record ->
            ReportClient.HealthRecord(
                type = "distance",
                value = record.distance.inMeters,
                unit = "m",
                timestamp = formatInstant(record.startTime),
                endTime = formatInstant(record.endTime)
            )
        }
    }

    private suspend fun readExercise(timeRange: TimeRangeFilter): List<ReportClient.HealthRecord> {
        val response = client.readRecords(ReadRecordsRequest(ExerciseSessionRecord::class, timeRange))
        return response.records.map { record ->
            val durationMin = java.time.Duration.between(record.startTime, record.endTime).toMinutes().toDouble()
            ReportClient.HealthRecord(
                type = "exercise",
                value = durationMin,
                unit = "min",
                timestamp = formatInstant(record.startTime),
                endTime = formatInstant(record.endTime)
            )
        }
    }

    private suspend fun readSleep(timeRange: TimeRangeFilter): List<ReportClient.HealthRecord> {
        val response = client.readRecords(ReadRecordsRequest(SleepSessionRecord::class, timeRange))
        return response.records.map { record ->
            val durationMin = java.time.Duration.between(record.startTime, record.endTime).toMinutes().toDouble()
            ReportClient.HealthRecord(
                type = "sleep",
                value = durationMin,
                unit = "min",
                timestamp = formatInstant(record.startTime),
                endTime = formatInstant(record.endTime)
            )
        }
    }

    private suspend fun readOxygenSaturation(timeRange: TimeRangeFilter): List<ReportClient.HealthRecord> {
        val response = client.readRecords(ReadRecordsRequest(OxygenSaturationRecord::class, timeRange))
        return response.records.map { record ->
            ReportClient.HealthRecord(
                type = "oxygen_saturation",
                value = record.percentage.value,
                unit = "%",
                timestamp = formatInstant(record.time)
            )
        }
    }

    private suspend fun readBodyTemperature(timeRange: TimeRangeFilter): List<ReportClient.HealthRecord> {
        val response = client.readRecords(ReadRecordsRequest(BodyTemperatureRecord::class, timeRange))
        return response.records.map { record ->
            ReportClient.HealthRecord(
                type = "body_temperature",
                value = record.temperature.inCelsius,
                unit = "°C",
                timestamp = formatInstant(record.time)
            )
        }
    }

    private suspend fun readRespiratoryRate(timeRange: TimeRangeFilter): List<ReportClient.HealthRecord> {
        val response = client.readRecords(ReadRecordsRequest(RespiratoryRateRecord::class, timeRange))
        return response.records.map { record ->
            ReportClient.HealthRecord(
                type = "respiratory_rate",
                value = record.rate,
                unit = "bpm",
                timestamp = formatInstant(record.time)
            )
        }
    }

    private suspend fun readBloodPressure(timeRange: TimeRangeFilter): List<ReportClient.HealthRecord> {
        val response = client.readRecords(ReadRecordsRequest(BloodPressureRecord::class, timeRange))
        return response.records.map { record ->
            // Report systolic as the primary value
            ReportClient.HealthRecord(
                type = "blood_pressure",
                value = record.systolic.inMillimetersOfMercury,
                unit = "mmHg",
                timestamp = formatInstant(record.time)
            )
        }
    }

    private suspend fun readBloodGlucose(timeRange: TimeRangeFilter): List<ReportClient.HealthRecord> {
        val response = client.readRecords(ReadRecordsRequest(BloodGlucoseRecord::class, timeRange))
        return response.records.map { record ->
            ReportClient.HealthRecord(
                type = "blood_glucose",
                value = record.level.inMillimolesPerLiter,
                unit = "mmol/L",
                timestamp = formatInstant(record.time)
            )
        }
    }

    private suspend fun readWeight(timeRange: TimeRangeFilter): List<ReportClient.HealthRecord> {
        val response = client.readRecords(ReadRecordsRequest(WeightRecord::class, timeRange))
        return response.records.map { record ->
            ReportClient.HealthRecord(
                type = "weight",
                value = record.weight.inKilograms,
                unit = "kg",
                timestamp = formatInstant(record.time)
            )
        }
    }

    private suspend fun readHeight(timeRange: TimeRangeFilter): List<ReportClient.HealthRecord> {
        val response = client.readRecords(ReadRecordsRequest(HeightRecord::class, timeRange))
        return response.records.map { record ->
            ReportClient.HealthRecord(
                type = "height",
                value = record.height.inMeters,
                unit = "m",
                timestamp = formatInstant(record.time)
            )
        }
    }

    private suspend fun readActiveCalories(timeRange: TimeRangeFilter): List<ReportClient.HealthRecord> {
        val response = client.readRecords(ReadRecordsRequest(ActiveCaloriesBurnedRecord::class, timeRange))
        return response.records.map { record ->
            ReportClient.HealthRecord(
                type = "active_calories",
                value = record.energy.inKilocalories,
                unit = "kcal",
                timestamp = formatInstant(record.startTime),
                endTime = formatInstant(record.endTime)
            )
        }
    }

    private suspend fun readTotalCalories(timeRange: TimeRangeFilter): List<ReportClient.HealthRecord> {
        val response = client.readRecords(ReadRecordsRequest(TotalCaloriesBurnedRecord::class, timeRange))
        return response.records.map { record ->
            ReportClient.HealthRecord(
                type = "total_calories",
                value = record.energy.inKilocalories,
                unit = "kcal",
                timestamp = formatInstant(record.startTime),
                endTime = formatInstant(record.endTime)
            )
        }
    }

    private suspend fun readHydration(timeRange: TimeRangeFilter): List<ReportClient.HealthRecord> {
        val response = client.readRecords(ReadRecordsRequest(HydrationRecord::class, timeRange))
        return response.records.map { record ->
            ReportClient.HealthRecord(
                type = "hydration",
                value = record.volume.inMilliliters,
                unit = "mL",
                timestamp = formatInstant(record.startTime),
                endTime = formatInstant(record.endTime)
            )
        }
    }

    private suspend fun readNutrition(timeRange: TimeRangeFilter): List<ReportClient.HealthRecord> {
        val response = client.readRecords(ReadRecordsRequest(NutritionRecord::class, timeRange))
        return response.records.map { record ->
            ReportClient.HealthRecord(
                type = "nutrition",
                value = record.totalCarbohydrate?.inGrams ?: 0.0,
                unit = "g",
                timestamp = formatInstant(record.startTime),
                endTime = formatInstant(record.endTime)
            )
        }
    }
}
