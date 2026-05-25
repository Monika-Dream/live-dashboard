package com.monika.dashboard.system

import android.content.Context
import android.content.pm.PackageManager
import com.monika.dashboard.data.DebugLog
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.concurrent.TimeUnit

class RootSystemCollector(private val context: Context) {

    suspend fun collect(): SystemSnapshot? = withContext(Dispatchers.IO) {
        val activity = runRoot("dumpsys activity activities")
        val window = runRoot("dumpsys window")
        val input = runRoot("dumpsys input_method")
        val media = runRoot("dumpsys media_session")

        if (activity == null && window == null && input == null && media == null) {
            DebugLog.log("root", "root采集不可用，降级为normal")
            return@withContext null
        }

        val foreground = parseForeground(activity.orEmpty(), window.orEmpty())
        val inputInfo = parseInput(input.orEmpty())
        val mediaInfo = parseMedia(media.orEmpty())
        SystemSnapshot(
            capabilityMode = "root",
            foreground = foreground,
            input = inputInfo,
            media = mediaInfo,
        )
    }

    private fun runRoot(command: String): String? {
        return try {
            val process = ProcessBuilder("su", "-c", command)
                .redirectErrorStream(true)
                .start()
            if (!process.waitFor(1500, TimeUnit.MILLISECONDS)) {
                process.destroyForcibly()
                return null
            }
            if (process.exitValue() != 0) return null
            process.inputStream.bufferedReader().use { it.readText().take(120_000) }
        } catch (_: Exception) {
            null
        }
    }

    private fun parseForeground(activityDump: String, windowDump: String): ForegroundInfo? {
        val combined = activityDump + "\n" + windowDump
        val patterns = listOf(
            Regex("""mResumedActivity:.*?\s([a-zA-Z0-9_.]+)/([a-zA-Z0-9_.$]+)"""),
            Regex("""topResumedActivity=.*?\s([a-zA-Z0-9_.]+)/([a-zA-Z0-9_.$]+)"""),
            Regex("""mCurrentFocus=.*?\s([a-zA-Z0-9_.]+)/([a-zA-Z0-9_.$]+)"""),
            Regex("""mFocusedApp=.*?\s([a-zA-Z0-9_.]+)/([a-zA-Z0-9_.$]+)"""),
        )
        for (pattern in patterns) {
            val match = pattern.find(combined) ?: continue
            val pkg = match.groupValues.getOrNull(1)?.takeIf { it.isNotBlank() } ?: continue
            val activity = match.groupValues.getOrNull(2)?.takeIf { it.isNotBlank() }
            return ForegroundInfo(
                packageName = pkg,
                appName = resolveAppName(pkg),
                activity = activity,
                source = "root",
                confidence = 0.8,
            )
        }
        return null
    }

    private fun parseInput(inputDump: String): InputInfo? {
        if (inputDump.isBlank()) return null
        val active = inputDump.contains("mInputShown=true", ignoreCase = true) ||
            inputDump.contains("inputShown=true", ignoreCase = true) ||
            inputDump.contains("mServedView", ignoreCase = true)
        return InputInfo(inputActive = active, isTyping = active, source = "root")
    }

    private fun parseMedia(mediaDump: String): MediaInfo? {
        if (mediaDump.isBlank()) return null
        val playing = mediaDump.contains("state=PlaybackState {state=3", ignoreCase = true) ||
            mediaDump.contains("state=3,", ignoreCase = true) ||
            mediaDump.contains("STATE_PLAYING", ignoreCase = true)
        if (!playing) return MediaInfo(playing = false, source = "root")

        val packageName = Regex("""package=([a-zA-Z0-9_.]+)""").find(mediaDump)?.groupValues?.getOrNull(1)
        val title = Regex("""title=([^,\n}]+)""").find(mediaDump)?.groupValues?.getOrNull(1)?.trim()
        val artist = Regex("""artist=([^,\n}]+)""").find(mediaDump)?.groupValues?.getOrNull(1)?.trim()
        return MediaInfo(
            playing = true,
            title = title,
            artist = artist,
            app = packageName?.let(::resolveAppName) ?: packageName,
            state = "playing",
            source = "root",
        )
    }

    private fun resolveAppName(packageName: String): String? {
        return try {
            val pm = context.packageManager
            val info = pm.getApplicationInfo(packageName, 0)
            pm.getApplicationLabel(info).toString()
        } catch (_: PackageManager.NameNotFoundException) {
            null
        } catch (_: Exception) {
            null
        }
    }
}
