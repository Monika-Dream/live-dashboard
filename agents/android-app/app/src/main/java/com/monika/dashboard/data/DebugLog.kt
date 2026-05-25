package com.monika.dashboard.data

import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.util.concurrent.ConcurrentLinkedDeque

/**
 * In-memory debug log buffer, visible in Status screen.
 * Thread-safe, capped at MAX_ENTRIES.
 */
object DebugLog {
    private const val MAX_ENTRIES = 100
    private val entries = ConcurrentLinkedDeque<String>()
    private val timeFmt = DateTimeFormatter.ofPattern("HH:mm:ss")

    val lines: List<String> get() = entries.toList()

    fun log(tag: String, message: String) {
        val time = LocalTime.now().format(timeFmt)
        val line = "$time [$tag] $message"
        entries.addFirst(line)
        // Trim excess entries
        while (entries.size > MAX_ENTRIES) {
            entries.pollLast()
        }
    }

    fun clear() = entries.clear()
}
