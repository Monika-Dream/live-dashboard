import { authenticateToken, isConfiguredDeviceId } from "../middleware/auth";
import { canReportHealth, db } from "../db";
import { getUtcDayRange, parseTimezoneOffset } from "../services/date-range";
import type { HealthRecord } from "../types";

const MAX_RECORDS_PER_REQUEST = 500;
const VALID_TYPES = new Set([
  "heart_rate", "resting_heart_rate", "heart_rate_variability",
  "steps", "distance", "exercise", "sleep",
  "oxygen_saturation", "body_temperature", "respiratory_rate",
  "blood_pressure", "blood_glucose",
  "weight", "height",
  "active_calories", "total_calories",
  "hydration", "nutrition",
]);

// 冲突时更新而不是丢弃：Health Connect 的记录会被数据源事后修正（如手环同步后
// 补全睡眠时长），DO NOTHING 会让库里永远留着第一次上报的旧值，数值偏小。
// 修复思路借鉴自社区 fork 作者 @qwe5283（github.com/qwe5283/live-dashboard），
// 感谢他发现旧值不更新导致的数据偏差问题。
const insertHealthRecord = db.prepare(`
  INSERT INTO health_records (device_id, type, value, unit, recorded_at, end_time)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(device_id, type, recorded_at, end_time) DO UPDATE SET
    value = excluded.value,
    unit = excluded.unit
  WHERE value IS NOT excluded.value OR unit IS NOT excluded.unit
`);

const insertMany = db.transaction((records: { deviceId: string; type: string; value: number; unit: string; recordedAt: string; endTime: string }[]) => {
  let inserted = 0;
  for (const r of records) {
    const result = insertHealthRecord.run(r.deviceId, r.type, r.value, r.unit, r.recordedAt, r.endTime);
    if (result.changes > 0) inserted++;
  }
  return inserted;
});

export async function handleHealthData(req: Request): Promise<Response> {
  const device = authenticateToken(req.headers.get("authorization"));
  if (!device) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canReportHealth(device.device_id)) {
    return Response.json(
      { error: "Consent required: health_reporting" },
      { status: 403 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.records) || body.records.length === 0) {
    return Response.json({ error: "records array required" }, { status: 400 });
  }

  if (body.records.length > MAX_RECORDS_PER_REQUEST) {
    return Response.json({ error: `Too many records (max ${MAX_RECORDS_PER_REQUEST})` }, { status: 400 });
  }

  const toInsert: { deviceId: string; type: string; value: number; unit: string; recordedAt: string; endTime: string }[] = [];

  for (const record of body.records) {
    if (typeof record.type !== "string" || !VALID_TYPES.has(record.type)) continue;
    if (typeof record.value !== "number" || !Number.isFinite(record.value)) continue;
    if (typeof record.unit !== "string" || record.unit.length > 20) continue;
    if (typeof record.timestamp !== "string" || !record.timestamp) continue;

    // Validate timestamp format
    const ts = new Date(record.timestamp);
    if (isNaN(ts.getTime())) continue;

    let endTime = "";
    if (typeof record.end_time === "string" && record.end_time) {
      const et = new Date(record.end_time);
      if (!isNaN(et.getTime())) {
        endTime = et.toISOString();
      }
    }

    toInsert.push({
      deviceId: device.device_id,
      type: record.type,
      value: record.value,
      unit: record.unit.slice(0, 20),
      recordedAt: ts.toISOString(),
      endTime,
    });
  }

  if (toInsert.length === 0) {
    return Response.json({ ok: true, inserted: 0 });
  }

  try {
    const inserted = insertMany(toInsert);
    return Response.json({ ok: true, inserted });
  } catch (e: any) {
    console.error("[health-data] DB error:", e.message);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}

// Query endpoint for frontend (public, like /api/current and /api/timeline)
export function handleHealthDataQuery(url: URL): Response {
  const date = url.searchParams.get("date");
  const deviceId = url.searchParams.get("device_id");

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: "date parameter required (YYYY-MM-DD)" }, { status: 400 });
  }

  if (deviceId && !isConfiguredDeviceId(deviceId)) {
    return Response.json({ date, records: [] });
  }

  // Browser timezone offset in minutes (e.g. -480 for UTC+8), same as /api/timeline.
  const tzOffsetMinutes = parseTimezoneOffset(url.searchParams.get("tz"));
  if (tzOffsetMinutes === null) {
    return Response.json({ error: "invalid tz offset" }, { status: 400 });
  }

  const dayRange = getUtcDayRange(date, tzOffsetMinutes);
  if (!dayRange) {
    return Response.json({ error: "invalid date" }, { status: 400 });
  }

  try {
    let records: HealthRecord[];
    if (deviceId) {
      records = db.prepare(`
        SELECT device_id, type, value, unit, recorded_at, end_time
        FROM health_records
        WHERE recorded_at >= ? AND recorded_at < ? AND device_id = ?
        ORDER BY recorded_at ASC
      `).all(dayRange.start, dayRange.end, deviceId) as HealthRecord[];
    } else {
      records = db.prepare(`
        SELECT device_id, type, value, unit, recorded_at, end_time
        FROM health_records
        WHERE recorded_at >= ? AND recorded_at < ?
        ORDER BY recorded_at ASC
      `).all(dayRange.start, dayRange.end) as HealthRecord[];
    }

    records = records.filter((record) => isConfiguredDeviceId(record.device_id));

    return Response.json({ date, records });
  } catch (e: any) {
    console.error("[health-data] Query error:", e.message);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
