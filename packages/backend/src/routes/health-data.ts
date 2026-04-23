import { authenticateToken, isConfiguredDeviceId } from "../middleware/auth";
import { canReportHealth, db } from "../db";
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

const insertHealthRecord = db.prepare(`
  INSERT INTO health_records (device_id, type, value, unit, recorded_at, end_time)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(device_id, type, recorded_at, end_time) DO NOTHING
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

  // Accept timezone offset in minutes (e.g. -480 for UTC+8), same as /api/timeline
  const tzParam = url.searchParams.get("tz");
  const tzOffsetMinutes = tzParam ? parseInt(tzParam, 10) : 0;

  try {
    if (tzOffsetMinutes && !isNaN(tzOffsetMinutes) && Math.abs(tzOffsetMinutes) <= 840) {
      // Convert offset to SQLite modifier (e.g. tz=-480 → "+08:00")
      const offsetHours = -tzOffsetMinutes / 60;
      const sign = offsetHours >= 0 ? "+" : "-";
      const absH = Math.floor(Math.abs(offsetHours));
      const absM = Math.round((Math.abs(offsetHours) - absH) * 60);
      const modifier = `${sign}${String(absH).padStart(2, "0")}:${String(absM).padStart(2, "0")}`;

      let records: HealthRecord[];
      if (deviceId) {
        records = db.prepare(`
          SELECT device_id, type, value, unit, recorded_at, end_time
          FROM health_records
          WHERE date(recorded_at, '${modifier}') = ? AND device_id = ?
          ORDER BY recorded_at ASC
        `).all(date, deviceId) as HealthRecord[];
      } else {
        records = db.prepare(`
          SELECT device_id, type, value, unit, recorded_at, end_time
          FROM health_records
          WHERE date(recorded_at, '${modifier}') = ?
          ORDER BY recorded_at ASC
        `).all(date) as HealthRecord[];
      }

      records = records.filter((record) => isConfiguredDeviceId(record.device_id));

      return Response.json({ date, records });
    }

    // No timezone offset — use UTC (backwards compatible)
    const startOfDay = `${date}T00:00:00.000Z`;
    const d = new Date(startOfDay);
    if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== date) {
      return Response.json({ error: "Invalid date" }, { status: 400 });
    }
    d.setUTCDate(d.getUTCDate() + 1);
    const startOfNextDay = d.toISOString();

    let records: HealthRecord[];
    if (deviceId) {
      records = db.prepare(`
        SELECT device_id, type, value, unit, recorded_at, end_time
        FROM health_records
        WHERE recorded_at >= ? AND recorded_at < ? AND device_id = ?
        ORDER BY recorded_at ASC
      `).all(startOfDay, startOfNextDay, deviceId) as HealthRecord[];
    } else {
      records = db.prepare(`
        SELECT device_id, type, value, unit, recorded_at, end_time
        FROM health_records
        WHERE recorded_at >= ? AND recorded_at < ?
        ORDER BY recorded_at ASC
      `).all(startOfDay, startOfNextDay) as HealthRecord[];
    }

    records = records.filter((record) => isConfiguredDeviceId(record.device_id));

    return Response.json({ date, records });
  } catch (e: any) {
    console.error("[health-data] Query error:", e.message);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
