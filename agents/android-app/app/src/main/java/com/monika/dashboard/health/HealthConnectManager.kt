package com.monika.dashboard.health

import android.content.Context
import android.os.Build
import android.util.Log
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.*
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.monika.dashboard.data.DebugLog
import com.monika.dashboard.network.ReportClient
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import java.time.Instant
import java.time.format.DateTimeFormatter
import java.util.concurrent.atomic.AtomicInteger
import kotlin.coroutines.cancellation.CancellationException

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

    /** Check if this device needs background read permission (Android 14+) */
    fun isBackgroundReadSupported(): Boolean = Build.VERSION.SDK_INT >= 34

    /** Data-type read permissions only (for permission request dialog) */
    val dataReadPermissions: Set<String> =
        HealthDataType.entries.map { it.permission }.toSet()

    /** All read permissions including background (for full permission check) */
    val allReadPermissions: Set<String> =
        dataReadPermissions + backgroundReadPermission

    /** Check which permissions are currently granted */
    suspend fun getGrantedPermissions(): Set<String> {
        return client.permissionController.getGrantedPermissions()
    }

    /** Permission request contract for use in Activity/Compose */
    fun createPermissionRequestContract() =
        PermissionController.createRequestPermissionResultContract()

    suspend fun readRecords(
        enabledTypes: Set<String>,
        since: Instant
    ): List<ReportClient.HealthRecord> {
        val now = Instant.now()
        if (!since.isBefore(now)) return emptyList()
        val timeRange = TimeRangeFilter.between(since, now)

        // Check permissions first, only read types with granted permissions
        val granted = getGrantedPermissions()
        DebugLog.log("健康", "已授权权限数: ${granted.size}/${allReadPermissions.size}")
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
        if (permittedTypes.isEmpty()) return emptyList()

        return coroutineScope {
            val securityDeniedCount = AtomicInteger(0)
            val deferreds = permittedTypes.map { type ->
                async {
                    try {
                        val results = readByType(type, timeRange)
                        if (results.isNotEmpty()) {
                            DebugLog.log("健康", "${type.displayName}: 读到 ${results.size} 条")
                        }
                        results
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: SecurityException) {
                        securityDeniedCount.incrementAndGet()
                        DebugLog.log("健康", "读取${type.displayName}时权限被拒绝，请重新授权")
                        Log.w(TAG, "SecurityException reading ${type.key}: ${e.message}")
                        emptyList<ReportClient.HealthRecord>()
                    } catch (e: Exception) {
                        DebugLog.log("健康", "读取${type.displayName}失败: ${e.message}")
                        Log.w(TAG, "Failed to read ${type.key}: ${e.message}")
                        emptyList<ReportClient.HealthRecord>()
                    }
                }
            }
            val results = deferreds.awaitAll().flatten()
            val denied = securityDeniedCount.get()
            if (denied > 0) {
                DebugLog.log("健康", "后台读取权限不足，跳过 $denied 种类型")
            }
            results
        }
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
