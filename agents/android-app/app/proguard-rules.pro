# ── OkHttp ────────────────────────────────────────────────────────
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }
-keepnames class okhttp3.internal.publicsuffix.PublicSuffixDatabase

# ── Health Connect ────────────────────────────────────────────────
-keep class androidx.health.connect.** { *; }
-keep class androidx.health.platform.** { *; }

# ── Encrypted SharedPreferences / Tink ────────────────────────────
-keep class com.google.crypto.tink.** { *; }
-dontwarn com.google.crypto.tink.**
-keep class androidx.security.crypto.** { *; }

# ── WorkManager ───────────────────────────────────────────────────
-keep class * extends androidx.work.Worker { *; }
-keep class * extends androidx.work.ListenableWorker { *; }

# ── Accessibility / Notification Listener ─────────────────────────
-keep class com.monika.dashboard.service.DashboardAccessibilityService { *; }
-keep class com.monika.dashboard.service.DashboardNotificationListenerService { *; }

# ── Data classes used for JSON serialisation ──────────────────────
-keep class com.monika.dashboard.network.ReportClient$HealthRecord { *; }
-keep class com.monika.dashboard.monitor.MusicSnapshot { *; }
-keep class com.monika.dashboard.monitor.CurrentAppSnapshot { *; }
-keep class com.monika.dashboard.monitor.AccessibilityCurrentAppStore$Snapshot { *; }
-keep class com.monika.dashboard.service.HeartbeatRunResult { *; }

# ── Kotlin / Coroutines ──────────────────────────────────────────
-dontwarn kotlinx.coroutines.**
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory {}
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler {}
-keepclassmembers class kotlinx.coroutines.** { volatile <fields>; }
