import { cleanupOldActivities, cleanupOldSummaries, markOfflineDevices } from "../db";
import { generateDailySummary } from "./daily-summary-gen";

// Cleanup old activities + old summaries every hour
setInterval(() => {
  try {
    const result = cleanupOldActivities.run();
    if (result.changes > 0) {
      console.log(`[cleanup] Deleted ${result.changes} old activity records`);
    }
  } catch (e) {
    console.error("[cleanup] Activities cleanup failed:", e);
  }

  try {
    const result = cleanupOldSummaries.run();
    if (result.changes > 0) {
      console.log(`[cleanup] Deleted ${result.changes} old daily summaries`);
    }
  } catch (e) {
    console.error("[cleanup] Summaries cleanup failed:", e);
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

// AI daily summary — check every minute, trigger at 21:00
let lastSummaryDate = "";
setInterval(() => {
  const now = new Date();
  if (now.getHours() === 21 && now.getMinutes() === 0) {
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    if (today !== lastSummaryDate) {
      lastSummaryDate = today;
      generateDailySummary().catch((e) => console.error("[cleanup] AI summary failed:", e));
    }
  }
}, 60_000);

console.log("[cleanup] Scheduled: hourly cleanup, 60s offline check, 21:00 AI summary");
