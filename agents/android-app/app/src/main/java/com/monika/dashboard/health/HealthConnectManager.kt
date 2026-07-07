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
import kotlin.reflect.KClass

data class BackgroundReadAvailability(
    val isAvailable: Boolean,
    val rawStatus: Int? = null,
    val errorMessage: String? = null,
)

data class HealthReadResult(
    val records: List<ReportClient.HealthRecord>,
    val attemptedTypes: Int,
    val deniedTypes: Int,
    /** 读取时超时或抛异常（非权限）的类型数。 */
    val failedTypes: Int = 0,
) {
    val allAttemptedTypesDenied: Boolean
        get() = attemptedTypes > 0 && deniedTypes == attemptedTypes && failedTypes == 0 && records.isEmpty()

    /** 是否所有已尝试的类型都成功完成（无超时/异常），权限被拒不算临时失败。 */
    val allTypesSucceeded: Boolean
        get() = attemptedTypes > 0 && failedTypes == 0
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

    /** 后台读取权限 */
    val backgroundReadPermission: String =
        HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND

    /**
     * Android 14+ 可能出现额外的 Health Connect 授权项，
     * 但后台读取能力是否真的可用，仍要在运行时检测。
     */
    val needsBackgroundPermission: Boolean = Build.VERSION.SDK_INT >= 34

    /** 仅包含数据读取权限，供授权界面使用。 */
    val dataReadPermissions: Set<String> = HealthDataType.entries.map { it.permission }.toSet()

    /** 应用可能申请到的全部读取权限。 */
    val allReadPermissions: Set<String> = buildSet {
        addAll(dataReadPermissions)
        if (needsBackgroundPermission) add(backgroundReadPermission)
    }

    /** 查询当前已授权的权限集合。 */
    suspend fun getGrantedPermissions(): Set<String> {
        return client.permissionController.getGrantedPermissions()
    }

    /** 给 Activity / Compose 用的权限请求契约。 */
    fun createPermissionRequestContract() =
        PermissionController.createRequestPermissionResultContract()

    /** 运行时检测后台读取能力是否可用。 */
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

        // 先按授权状态过滤类型，避免把权限错误和读取错误混在一起。
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
        var readFailedCount = 0
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
                readFailedCount++
                DebugLog.log("健康", "${type.displayName}: 超时，跳过")
                Log.w(TAG, "Timeout reading ${type.key}")
            } catch (e: SecurityException) {
                securityDeniedCount++
                DebugLog.log("健康", "${type.displayName}: 权限被拒绝")
                Log.w(TAG, "SecurityException reading ${type.key}: ${e.message}")
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                readFailedCount++
                DebugLog.log("健康", "${type.displayName}: 失败 ${e.message}")
                Log.w(TAG, "Failed to read ${type.key}: ${e.message}")
            }
        }
        if (securityDeniedCount > 0) {
            DebugLog.log("健康", "权限不足，跳过 $securityDeniedCount 种类型")
        }
        if (readFailedCount > 0) {
            DebugLog.log("健康", "读取失败/超时 $readFailedCount 种类型")
        }
        return HealthReadResult(
            records = allResults,
            attemptedTypes = permittedTypes.size,
            deniedTypes = securityDeniedCount,
            failedTypes = readFailedCount,
        )
    }

    /** 读取今天零点到现在的数据，供打开 APP 时的前台同步使用。 */
    suspend fun readTodayRecords(enabledTypes: Set<String>): List<ReportClient.HealthRecord> {
        val todayStart = LocalDate.now().atStartOfDay(ZoneId.systemDefault()).toInstant()
        return readRecords(enabledTypes, todayStart, Instant.now()).records
    }

    private suspend fun <T : Record> readAllRecords(
        recordType: KClass<T>,
        timeRange: TimeRangeFilter
    ): List<T> {
        val records = mutableListOf<T>()
        var pageToken: String? = null

        do {
            val response = client.readRecords(
                ReadRecordsRequest(
                    recordType = recordType,
                    timeRangeFilter = timeRange,
                    pageSize = PAGE_SIZE,
                    pageToken = pageToken
                )
            )
            records += response.records
            pageToken = response.pageToken?.takeIf { it.isNotEmpty() }
        } while (pageToken != null)

        return records
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
        return readAllRecords(HeartRateRecord::class, timeRange).flatMap { record ->
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
        return readAllRecords(RestingHeartRateRecord::class, timeRange).map { record ->
            ReportClient.HealthRecord(
                type = "resting_heart_rate",
                value = record.beatsPerMinute.toDouble(),
                unit = "bpm",
                timestamp = formatInstant(record.time)
            )
        }
    }

    private suspend fun readHRV(timeRange: TimeRangeFilter): List<ReportClient.HealthRecord> {
        return readAllRecords(HeartRateVariabilityRmssdRecord::class, timeRange).map { record ->
            ReportClient.HealthRecord(
                type = "heart_rate_variability",
                value = record.heartRateVariabilityMillis,
                unit = "ms",
                timestamp = formatInstant(record.time)
            )
        }
    }

    private suspend fun readSteps(timeRange: TimeRangeFilter): List<ReportClient.HealthRecord> {
        return readAllRecords(StepsRecord::class, timeRange).map { record ->
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
        return readAllRecords(DistanceRecord::class, timeRange).map { record ->
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
        return readAllRecords(ExerciseSessionRecord::class, timeRange).map { record ->
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
        return readAllRecords(SleepSessionRecord::class, timeRange).map { record ->
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
        return readAllRecords(OxygenSaturationRecord::class, timeRange).map { record ->
            ReportClient.HealthRecord(
                type = "oxygen_saturation",
                value = record.percentage.value,
                unit = "%",
                timestamp = formatInstant(record.time)
            )
        }
    }

    private suspend fun readBodyTemperature(timeRange: TimeRangeFilter): List<ReportClient.HealthRecord> {
        return readAllRecords(BodyTemperatureRecord::class, timeRange).map { record ->
            ReportClient.HealthRecord(
                type = "body_temperature",
                value = record.temperature.inCelsius,
                unit = "°C",
                timestamp = formatInstant(record.time)
            )
        }
    }

    private suspend fun readRespiratoryRate(timeRange: TimeRangeFilter): List<ReportClient.HealthRecord> {
        return readAllRecords(RespiratoryRateRecord::class, timeRange).map { record ->
            ReportClient.HealthRecord(
                type = "respiratory_rate",
                value = record.rate,
                unit = "breaths/min",
                timestamp = formatInstant(record.time)
            )
        }
    }

    private suspend fun readBloodPressure(timeRange: TimeRangeFilter): List<ReportClient.HealthRecord> {
        return readAllRecords(BloodPressureRecord::class, timeRange).flatMap { record ->
            val ts = formatInstant(record.time)
            listOf(
                ReportClient.HealthRecord(
                    type = "blood_pressure_systolic",
                    value = record.systolic.inMillimetersOfMercury,
                    unit = "mmHg",
                    timestamp = ts
                ),
                ReportClient.HealthRecord(
                    type = "blood_pressure_diastolic",
                    value = record.diastolic.inMillimetersOfMercury,
                    unit = "mmHg",
                    timestamp = ts
                )
            )
        }
    }

    private suspend fun readBloodGlucose(timeRange: TimeRangeFilter): List<ReportClient.HealthRecord> {
        return readAllRecords(BloodGlucoseRecord::class, timeRange).map { record ->
            ReportClient.HealthRecord(
                type = "blood_glucose",
                value = record.level.inMillimolesPerLiter,
                unit = "mmol/L",
                timestamp = formatInstant(record.time)
            )
        }
    }

    private suspend fun readWeight(timeRange: TimeRangeFilter): List<ReportClient.HealthRecord> {
        return readAllRecords(WeightRecord::class, timeRange).map { record ->
            ReportClient.HealthRecord(
                type = "weight",
                value = record.weight.inKilograms,
                unit = "kg",
                timestamp = formatInstant(record.time)
            )
        }
    }

    private suspend fun readHeight(timeRange: TimeRangeFilter): List<ReportClient.HealthRecord> {
        return readAllRecords(HeightRecord::class, timeRange).map { record ->
            ReportClient.HealthRecord(
                type = "height",
                value = record.height.inMeters,
                unit = "m",
                timestamp = formatInstant(record.time)
            )
        }
    }

    private suspend fun readActiveCalories(timeRange: TimeRangeFilter): List<ReportClient.HealthRecord> {
        return readAllRecords(ActiveCaloriesBurnedRecord::class, timeRange).map { record ->
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
        return readAllRecords(TotalCaloriesBurnedRecord::class, timeRange).map { record ->
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
        return readAllRecords(HydrationRecord::class, timeRange).map { record ->
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
        return readAllRecords(NutritionRecord::class, timeRange).mapNotNull { record ->
            val carbs = record.totalCarbohydrate?.inGrams ?: return@mapNotNull null
            ReportClient.HealthRecord(
                type = "nutrition",
                value = carbs,
                unit = "g",
                timestamp = formatInstant(record.startTime),
                endTime = formatInstant(record.endTime)
            )
        }
    }
}
