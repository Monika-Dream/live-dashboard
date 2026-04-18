import {
  getTimelineByDate,
  getTimelineByDateAndDevice,
} from "../db";
import type { ActivityRecord, TimelineSegment } from "../types";
import { db } from "../db";

export function handleTimeline(url: URL): Response {
  const date = url.searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json(
      { error: "date parameter required (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  // Accept timezone offset in minutes (e.g. -480 for UTC+8)
  const tzParam = url.searchParams.get("tz");
  const tzOffsetMinutes = tzParam ? parseInt(tzParam, 10) : 0;

  const deviceId = url.searchParams.get("device_id");

  let activities: ActivityRecord[];

  if (tzOffsetMinutes && !isNaN(tzOffsetMinutes) && Math.abs(tzOffsetMinutes) <= 840) {
    // Convert offset minutes to SQLite time modifier format (e.g. "+08:00" for tz=-480)
    const offsetHours = -tzOffsetMinutes / 60;
    const sign = offsetHours >= 0 ? "+" : "-";
    const absH = Math.floor(Math.abs(offsetHours));
    const absM = Math.round((Math.abs(offsetHours) - absH) * 60);
    const modifier = `${sign}${String(absH).padStart(2, "0")}:${String(absM).padStart(2, "0")}`;

    // Query with timezone adjustment: convert started_at to user's local date
    const query = deviceId
      ? db.prepare(`SELECT * FROM activities WHERE date(started_at, '${modifier}') = ? AND device_id = ? ORDER BY started_at ASC`)
      : db.prepare(`SELECT * FROM activities WHERE date(started_at, '${modifier}') = ? ORDER BY started_at ASC`);

    activities = deviceId
      ? (query.all(date, deviceId) as ActivityRecord[])
      : (query.all(date) as ActivityRecord[]);
  } else {
    // No timezone offset — use UTC (backwards compatible)
    activities = deviceId
      ? (getTimelineByDateAndDevice.all(date, deviceId) as ActivityRecord[])
      : (getTimelineByDate.all(date) as ActivityRecord[]);
  }

  // Build timeline segments with duration
  // Gap threshold: if time between two consecutive activities exceeds this,
  // the device was likely offline (sleep/shutdown). Agent heartbeats every 60s,
  // so a 2-minute gap means the device went away.
  const GAP_THRESHOLD_MS = 2 * 60 * 1000;

  const segments: TimelineSegment[] = [];
  for (let i = 0; i < activities.length; i++) {
    const a = activities[i];
    // Find next activity on same device to compute end time
    let endedAt: string | null = null;
    for (let j = i + 1; j < activities.length; j++) {
      if (activities[j].device_id === a.device_id) {
        endedAt = activities[j].started_at;
        break;
      }
    }

    const startMs = new Date(a.started_at).getTime();
    if (isNaN(startMs)) continue; // skip malformed timestamps

    let endMs = endedAt ? new Date(endedAt).getTime() : startMs;
    if (isNaN(endMs)) endMs = startMs;

    // If the gap to the next activity exceeds the threshold, the device was
    // offline in between. Cap this segment's end to 1 minute after its start
    // (approximate last heartbeat window) instead of spanning the full gap.
    if (endedAt && endMs - startMs > GAP_THRESHOLD_MS) {
      endMs = startMs + 60_000;
      endedAt = new Date(endMs).toISOString();
    }

    const durationMinutes = Math.max(0, Math.round((endMs - startMs) / 60000));

    segments.push({
      app_name: a.app_name,
      app_id: a.app_id,
      display_title: a.display_title || "",
      started_at: a.started_at,
      ended_at: endedAt,
      duration_minutes: durationMinutes,
      device_id: a.device_id,
      device_name: a.device_name,
    });
  }

  // Build summary: total minutes per app per device
  const summaryNested = new Map<string, Map<string, number>>();
  for (const s of segments) {
    let appMap = summaryNested.get(s.device_id);
    if (!appMap) {
      appMap = new Map();
      summaryNested.set(s.device_id, appMap);
    }
    appMap.set(s.app_name, (appMap.get(s.app_name) || 0) + s.duration_minutes);
  }

  const summary: Record<string, Record<string, number>> = {};
  for (const [devId, appMap] of summaryNested) {
    summary[devId] = Object.fromEntries(appMap);
  }

  return Response.json({ date, segments, summary });
}
