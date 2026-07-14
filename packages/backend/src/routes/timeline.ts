import {
  getTimelineByRange,
  getTimelineByRangeAndDevice,
} from "../db";
import type { ActivityRecord, TimelineSegment } from "../types";
import { isConfiguredDeviceId } from "../middleware/auth";
import { getUtcDayRange, parseTimezoneOffset } from "../services/date-range";
import { resolveAppMeta } from "../services/app-mapper";

export function handleTimeline(url: URL): Response {
  const date = url.searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json(
      { error: "date parameter required (YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  // Browser timezone offset in minutes (e.g. -480 for UTC+8).
  const tzOffsetMinutes = parseTimezoneOffset(url.searchParams.get("tz"));
  if (tzOffsetMinutes === null) {
    return Response.json({ error: "invalid tz offset" }, { status: 400 });
  }

  const dayRange = getUtcDayRange(date, tzOffsetMinutes);
  if (!dayRange) {
    return Response.json({ error: "invalid date" }, { status: 400 });
  }

  const deviceId = url.searchParams.get("device_id");

  if (deviceId && !isConfiguredDeviceId(deviceId)) {
    return Response.json({ date, segments: [], summary: {} });
  }

  let activities = deviceId
    ? (getTimelineByRangeAndDevice.all(
        deviceId,
        dayRange.start,
        dayRange.end,
      ) as ActivityRecord[])
    : (getTimelineByRange.all(dayRange.start, dayRange.end) as ActivityRecord[]);

  activities = activities.filter((activity) => isConfiguredDeviceId(activity.device_id));

  // Build timeline segments with duration
  // Gap threshold: if time between two consecutive activities exceeds this,
  // the device was likely offline (sleep/shutdown). Agent heartbeats every 60s,
  // so a 2-minute gap means the device went away.
  const GAP_THRESHOLD_MS = 2 * 60 * 1000;

  // Find the next activity for every device in one reverse pass. The former
  // nested forward search was O(n²) for interleaved device timelines.
  const nextStartedAt = new Array<string | null>(activities.length).fill(null);
  const nextByDevice = new Map<string, string>();
  for (let i = activities.length - 1; i >= 0; i--) {
    const activity = activities[i];
    if (!activity) continue;
    nextStartedAt[i] = nextByDevice.get(activity.device_id) ?? null;
    nextByDevice.set(activity.device_id, activity.started_at);
  }

  const segments: TimelineSegment[] = [];
  for (let i = 0; i < activities.length; i++) {
    const a = activities[i];
    if (!a) continue;
    const { appName, statusText } = resolveAppMeta(a.app_id, a.platform, a.app_name);
    let endedAt = nextStartedAt[i] ?? null;

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
      app_name: appName,
      app_id: a.app_id,
      status_text: statusText,
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
