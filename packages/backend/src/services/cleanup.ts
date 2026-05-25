import { cleanupExpiredMessages, cleanupOldActivities, cleanupOldLocations, markOfflineDevices } from "../db";

// Cleanup old activities every hour
setInterval(() => {
  try {
    const result = cleanupOldActivities.run();
    const locationResult = cleanupOldLocations.run();
    const messageResult = cleanupExpiredMessages.run();
    if (result.changes > 0) {
      console.log(`[cleanup] Deleted ${result.changes} old activity records`);
    }
    if (messageResult.changes > 0) {
      console.log(`[cleanup] Deleted ${messageResult.changes} expired device messages`);
    }
    if (locationResult.changes > 0) {
      console.log(`[cleanup] Deleted ${locationResult.changes} old location records`);
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
