package com.monika.dashboard.system

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.monika.dashboard.data.DebugLog

class LsposedBridgeReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_STATUS) return
        val foreground = ForegroundInfo(
            packageName = intent.getStringExtra(EXTRA_PACKAGE),
            appName = intent.getStringExtra(EXTRA_APP_NAME),
            activity = intent.getStringExtra(EXTRA_ACTIVITY),
            source = "lsposed",
            confidence = 0.95,
        )
        val input = InputInfo(
            inputActive = intent.takeIf { it.hasExtra(EXTRA_INPUT_ACTIVE) }
                ?.getBooleanExtra(EXTRA_INPUT_ACTIVE, false),
            isTyping = intent.takeIf { it.hasExtra(EXTRA_INPUT_ACTIVE) }
                ?.getBooleanExtra(EXTRA_INPUT_ACTIVE, false),
            source = "lsposed",
        )
        val media = MediaInfo(
            playing = intent.takeIf { it.hasExtra(EXTRA_MEDIA_PLAYING) }
                ?.getBooleanExtra(EXTRA_MEDIA_PLAYING, false),
            title = intent.getStringExtra(EXTRA_MEDIA_TITLE),
            artist = intent.getStringExtra(EXTRA_MEDIA_ARTIST),
            app = intent.getStringExtra(EXTRA_MEDIA_APP),
            state = intent.getStringExtra(EXTRA_MEDIA_STATE),
            source = "lsposed",
        )
        SystemSnapshotStore.updateFromLsposed(
            SystemSnapshot(
                capabilityMode = "lsposed",
                foreground = foreground.takeIf { it.packageName != null || it.activity != null },
                input = input.takeIf { it.inputActive != null },
                media = media.takeIf { it.playing != null || it.title != null || it.app != null },
            )
        )
        DebugLog.log("LSPosed", "收到系统状态事件")
    }

    companion object {
        const val ACTION_STATUS = "com.monika.dashboard.LSPOSED_STATUS"
        const val EXTRA_PACKAGE = "package_name"
        const val EXTRA_APP_NAME = "app_name"
        const val EXTRA_ACTIVITY = "activity"
        const val EXTRA_INPUT_ACTIVE = "input_active"
        const val EXTRA_MEDIA_PLAYING = "media_playing"
        const val EXTRA_MEDIA_TITLE = "media_title"
        const val EXTRA_MEDIA_ARTIST = "media_artist"
        const val EXTRA_MEDIA_APP = "media_app"
        const val EXTRA_MEDIA_STATE = "media_state"
    }
}
