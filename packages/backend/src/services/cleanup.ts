import { cleanupOldActivities, cleanupOldMusicHistory, markOfflineDevices } from "../db";

// Cleanup old activities every hour
setInterval(() => {
  try {
    const result = cleanupOldActivities.run();
    if (result.changes > 0) {
      console.log(`[cleanup] Deleted ${result.changes} old activity records`);
    }
    const musicResult = cleanupOldMusicHistory.run();
    if (musicResult.changes > 0) {
      console.log(`[cleanup] Deleted ${musicResult.changes} old music records`);
    }
  } catch (e) {
    console.error("[cleanup] Failed:", e);
  }
}, 60 * 60 * 1000);

// Mark offline devices every 60 seconds
setInterval(() => {
  try {
    markOfflineDevices.run();
  } catch {
    // silent
  }
}, 60_000);

console.log("[cleanup] Scheduled: hourly data cleanup + 60s offline check");
