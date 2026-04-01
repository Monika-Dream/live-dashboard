package com.monika.dashboard.media

import android.content.ComponentName
import android.content.Context
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.monika.dashboard.data.SettingsStore

class MediaSessionMonitor(
    private val context: Context,
    private val settings: SettingsStore
) {
    private val mediaSessionManager =
        context.getSystemService(Context.MEDIA_SESSION_SERVICE) as MediaSessionManager

    private val listener = MediaSessionManager.OnActiveSessionsChangedListener { controllers ->
        processControllers(controllers.orEmpty())
    }

    private val handler = Handler(Looper.getMainLooper())
    private val pollRunnable = object : Runnable {
        override fun run() {
            pollActiveSessions()
            handler.postDelayed(this, 3000L)
        }
    }

    private val callbacks = mutableMapOf<String, MediaController.Callback>()

    fun start() {
        val componentName = ComponentName(context, MediaNotificationListenerService::class.java)
        runCatching {
            mediaSessionManager.addOnActiveSessionsChangedListener(listener, componentName)
            processControllers(mediaSessionManager.getActiveSessions(componentName).orEmpty())
        }
        handler.postDelayed(pollRunnable, 3000L)
        Log.i("MediaSession", "Monitor started")
    }

    fun stop() {
        handler.removeCallbacks(pollRunnable)
        runCatching {
            mediaSessionManager.removeOnActiveSessionsChangedListener(listener)
        }
        callbacks.forEach { (token, callback) ->
            runCatching {
                mediaSessionManager.getActiveSessions(ComponentName(context, MediaNotificationListenerService::class.java))
                    .firstOrNull { it.sessionToken.toString() == token }
                    ?.unregisterCallback(callback)
            }
        }
        callbacks.clear()
        Log.i("MediaSession", "Monitor stopped")
    }

    private fun pollActiveSessions() {
        val componentName = ComponentName(context, MediaNotificationListenerService::class.java)
        val controllers = runCatching { mediaSessionManager.getActiveSessions(componentName).orEmpty() }.getOrDefault(emptyList())
        processControllers(controllers)

        val hasPlayingSession = controllers.any { controller ->
            when (controller.playbackState?.state) {
                PlaybackState.STATE_PLAYING,
                PlaybackState.STATE_BUFFERING,
                PlaybackState.STATE_FAST_FORWARDING,
                PlaybackState.STATE_REWINDING,
                PlaybackState.STATE_SKIPPING_TO_NEXT,
                PlaybackState.STATE_SKIPPING_TO_PREVIOUS,
                PlaybackState.STATE_SKIPPING_TO_QUEUE_ITEM -> true
                else -> false
            }
        }

        if (!hasPlayingSession) {
            MediaSyncCoordinator.handleSnapshot(
                MediaSnapshot(
                    title = "",
                    artist = "",
                    packageName = "",
                    appName = "",
                    playbackState = PlaybackStateEnum.STOPPED,
                    updatedAt = System.currentTimeMillis()
                ),
                settings
            )
        }
    }

    private fun processControllers(controllers: List<MediaController>) {
        val currentTokens = controllers.map { it.sessionToken.toString() }.toSet()

        callbacks.entries.removeAll { (token, callback) ->
            val shouldRemove = token !in currentTokens
            if (shouldRemove) {
                controllers.firstOrNull { it.sessionToken.toString() == token }?.unregisterCallback(callback)
            }
            shouldRemove
        }

        controllers.forEach { controller ->
            val token = controller.sessionToken.toString()
            if (token !in callbacks) {
                val callback = object : MediaController.Callback() {
                    override fun onMetadataChanged(metadata: MediaMetadata?) {
                        emitSnapshot(controller)
                    }

                    override fun onPlaybackStateChanged(state: PlaybackState?) {
                        emitSnapshot(controller)
                    }

                    override fun onSessionDestroyed() {
                        MediaSyncCoordinator.handleSnapshot(
                            MediaSnapshot(
                                title = "",
                                artist = "",
                                packageName = controller.packageName,
                                appName = PackageMapper.toDisplayName(controller.packageName),
                                playbackState = PlaybackStateEnum.STOPPED,
                                updatedAt = System.currentTimeMillis()
                            ),
                            settings
                        )
                    }
                }
                controller.registerCallback(callback)
                callbacks[token] = callback
            }
            emitSnapshot(controller)
        }
    }

    private fun emitSnapshot(controller: MediaController) {
        val metadata = controller.metadata
        val playbackState = controller.playbackState
        val title = metadata?.getString(MediaMetadata.METADATA_KEY_TITLE).orEmpty().trim()
        val artist = metadata?.getString(MediaMetadata.METADATA_KEY_ARTIST).orEmpty().trim()

        val state = when (playbackState?.state) {
            PlaybackState.STATE_PLAYING,
            PlaybackState.STATE_BUFFERING,
            PlaybackState.STATE_FAST_FORWARDING,
            PlaybackState.STATE_REWINDING,
            PlaybackState.STATE_SKIPPING_TO_NEXT,
            PlaybackState.STATE_SKIPPING_TO_PREVIOUS,
            PlaybackState.STATE_SKIPPING_TO_QUEUE_ITEM -> PlaybackStateEnum.PLAYING

            PlaybackState.STATE_PAUSED -> PlaybackStateEnum.PAUSED
            PlaybackState.STATE_STOPPED,
            PlaybackState.STATE_NONE -> PlaybackStateEnum.STOPPED

            else -> PlaybackStateEnum.UNKNOWN
        }

        if (title.isBlank() && artist.isBlank() && state == PlaybackStateEnum.UNKNOWN) {
            return
        }

        MediaSyncCoordinator.handleSnapshot(
            MediaSnapshot(
                title = title,
                artist = artist,
                packageName = controller.packageName,
                appName = PackageMapper.toDisplayName(controller.packageName),
                playbackState = state,
                updatedAt = System.currentTimeMillis()
            ),
            settings
        )
    }
}
