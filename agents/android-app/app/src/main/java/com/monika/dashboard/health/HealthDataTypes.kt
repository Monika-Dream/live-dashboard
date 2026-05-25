package com.monika.dashboard.health

import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.*

/**
 * 18 health data types supported by the app.
 * Each type maps to a Health Connect record class and permission.
 */
enum class HealthDataType(
    val key: String,
    val displayName: String,
    val unit: String,
    val icon: String,
    val permission: String,
    val recordClass: Class<out Record>
) {
    HEART_RATE(
        "heart_rate", "心率", "bpm", "\u2764\uFE0F",
        HealthPermission.getReadPermission(HeartRateRecord::class),
        HeartRateRecord::class.java
    ),
    RESTING_HEART_RATE(
        "resting_heart_rate", "静息心率", "bpm", "\uD83D\uDC9A",
        HealthPermission.getReadPermission(RestingHeartRateRecord::class),
        RestingHeartRateRecord::class.java
    ),
    HEART_RATE_VARIABILITY(
        "heart_rate_variability", "心率变异性", "ms", "\uD83D\uDC9C",
        HealthPermission.getReadPermission(HeartRateVariabilityRmssdRecord::class),
        HeartRateVariabilityRmssdRecord::class.java
    ),
    STEPS(
        "steps", "步数", "count", "\uD83D\uDEB6",
        HealthPermission.getReadPermission(StepsRecord::class),
        StepsRecord::class.java
    ),
    DISTANCE(
        "distance", "距离", "m", "\uD83D\uDCCF",
        HealthPermission.getReadPermission(DistanceRecord::class),
        DistanceRecord::class.java
    ),
    EXERCISE(
        "exercise", "运动", "min", "\uD83C\uDFC3",
        HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        ExerciseSessionRecord::class.java
    ),
    SLEEP(
        "sleep", "睡眠", "min", "\uD83D\uDE34",
        HealthPermission.getReadPermission(SleepSessionRecord::class),
        SleepSessionRecord::class.java
    ),
    OXYGEN_SATURATION(
        "oxygen_saturation", "血氧", "%", "\uD83E\uDE78",
        HealthPermission.getReadPermission(OxygenSaturationRecord::class),
        OxygenSaturationRecord::class.java
    ),
    BODY_TEMPERATURE(
        "body_temperature", "体温", "°C", "\uD83C\uDF21\uFE0F",
        HealthPermission.getReadPermission(BodyTemperatureRecord::class),
        BodyTemperatureRecord::class.java
    ),
    RESPIRATORY_RATE(
        "respiratory_rate", "呼吸频率", "breaths/min", "\uD83D\uDCA8",
        HealthPermission.getReadPermission(RespiratoryRateRecord::class),
        RespiratoryRateRecord::class.java
    ),
    BLOOD_PRESSURE(
        "blood_pressure", "血压", "mmHg", "\uD83E\uDE7A",
        HealthPermission.getReadPermission(BloodPressureRecord::class),
        BloodPressureRecord::class.java
    ),
    BLOOD_GLUCOSE(
        "blood_glucose", "血糖", "mmol/L", "\uD83E\uDE78",
        HealthPermission.getReadPermission(BloodGlucoseRecord::class),
        BloodGlucoseRecord::class.java
    ),
    WEIGHT(
        "weight", "体重", "kg", "\u2696\uFE0F",
        HealthPermission.getReadPermission(WeightRecord::class),
        WeightRecord::class.java
    ),
    HEIGHT(
        "height", "身高", "m", "\uD83D\uDCCF",
        HealthPermission.getReadPermission(HeightRecord::class),
        HeightRecord::class.java
    ),
    ACTIVE_CALORIES(
        "active_calories", "活动卡路里", "kcal", "\uD83D\uDD25",
        HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
        ActiveCaloriesBurnedRecord::class.java
    ),
    TOTAL_CALORIES(
        "total_calories", "总卡路里", "kcal", "\uD83D\uDD25",
        HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class),
        TotalCaloriesBurnedRecord::class.java
    ),
    HYDRATION(
        "hydration", "饮水", "mL", "\uD83D\uDCA7",
        HealthPermission.getReadPermission(HydrationRecord::class),
        HydrationRecord::class.java
    ),
    NUTRITION(
        "nutrition", "营养", "g", "\uD83C\uDF4E",
        HealthPermission.getReadPermission(NutritionRecord::class),
        NutritionRecord::class.java
    );

    companion object {
        fun fromKey(key: String): HealthDataType? = entries.find { it.key == key }

        fun permissionsForTypes(types: Set<String>): Set<String> =
            types.mapNotNull { key -> fromKey(key)?.permission }.toSet()
    }
}
