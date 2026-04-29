import { authenticateToken } from "../middleware/auth";
import { canReportHealth, db } from "../db";

/**
 * Accepts health data in the format sent by health-connect-webhook
 * (https://github.com/mcnaveen/health-connect-webhook).
 *
 * Transforms the external format into internal health_records rows.
 *
 * External format example:
 * {
 *   "timestamp": "2026-03-22T07:41:59Z",
 *   "app_version": "1.0",
 *   "steps": [{ "count": 3202, "start_time": "...", "end_time": "..." }],
 *   "heart_rate": [{ "bpm": 61, "time": "..." }],
 *   "oxygen_saturation": [{ "percentage": 98.0, "time": "..." }],
 *   "active_calories": [{ "calories": 45.0, "start_time": "...", "end_time": "..." }],
 *   "total_calories": [{ "calories": 1575.75, "start_time": "...", "end_time": "..." }]
 * }
 */

const MAX_RECORDS = 2000;

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

function parseTime(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

interface ToInsert {
  deviceId: string;
  type: string;
  value: number;
  unit: string;
  recordedAt: string;
  endTime: string;
}

export async function handleHealthWebhook(req: Request): Promise<Response> {
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

  if (typeof body !== "object" || body === null) {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }

  const records: ToInsert[] = [];
  const deviceId = device.device_id;

  // Helper: safely check if item is a non-null object
  function isObj(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
  }

  // Helper: try to add a record, returns false when limit reached
  function add(type: string, value: unknown, unit: string, recordedAt: string | null, endTime?: string | null): boolean {
    if (records.length >= MAX_RECORDS) return false;
    if (!recordedAt) return true; // skip but don't stop
    if (typeof value !== "number" || !Number.isFinite(value)) return true;
    records.push({ deviceId, type, value, unit, recordedAt, endTime: endTime || "" });
    return true;
  }

  // heart_rate: [{ bpm, time }]
  if (Array.isArray(body.heart_rate)) {
    for (const item of body.heart_rate) {
      if (!isObj(item)) continue;
      if (!add("heart_rate", item.bpm, "bpm", parseTime(item.time))) break;
    }
  }

  // steps: [{ count, start_time, end_time }]
  if (Array.isArray(body.steps)) {
    for (const item of body.steps) {
      if (!isObj(item)) continue;
      if (!add("steps", item.count, "count", parseTime(item.start_time), parseTime(item.end_time))) break;
    }
  }

  // oxygen_saturation: [{ percentage, time }]
  if (Array.isArray(body.oxygen_saturation)) {
    for (const item of body.oxygen_saturation) {
      if (!isObj(item)) continue;
      if (!add("oxygen_saturation", item.percentage, "%", parseTime(item.time))) break;
    }
  }

  // active_calories: [{ calories, start_time, end_time }]
  if (Array.isArray(body.active_calories)) {
    for (const item of body.active_calories) {
      if (!isObj(item)) continue;
      if (!add("active_calories", item.calories, "kcal", parseTime(item.start_time), parseTime(item.end_time))) break;
    }
  }

  // total_calories: [{ calories, start_time, end_time }]
  if (Array.isArray(body.total_calories)) {
    for (const item of body.total_calories) {
      if (!isObj(item)) continue;
      if (!add("total_calories", item.calories, "kcal", parseTime(item.start_time), parseTime(item.end_time))) break;
    }
  }

  // sleep: [{ duration_minutes | minutes, start_time, end_time }]
  if (Array.isArray(body.sleep)) {
    for (const item of body.sleep) {
      if (!isObj(item)) continue;
      const val = (item as any).duration_minutes ?? (item as any).minutes;
      if (!add("sleep", val, "min", parseTime(item.start_time), parseTime(item.end_time))) break;
    }
  }

  // weight: [{ weight | kg, time }]
  if (Array.isArray(body.weight)) {
    for (const item of body.weight) {
      if (!isObj(item)) continue;
      const val = (item as any).weight ?? (item as any).kg;
      if (!add("weight", val, "kg", parseTime(item.time))) break;
    }
  }

  // blood_pressure: [{ systolic, diastolic, time }] — stores systolic (matches Android app behavior)
  if (Array.isArray(body.blood_pressure)) {
    for (const item of body.blood_pressure) {
      if (!isObj(item)) continue;
      if (!add("blood_pressure", item.systolic, "mmHg", parseTime(item.time))) break;
    }
  }

  // blood_glucose: [{ level | mmol_l, time }]
  if (Array.isArray(body.blood_glucose)) {
    for (const item of body.blood_glucose) {
      if (!isObj(item)) continue;
      const val = (item as any).level ?? (item as any).mmol_l;
      if (!add("blood_glucose", val, "mmol/L", parseTime(item.time))) break;
    }
  }

  // body_temperature: [{ temperature | celsius, time }]
  if (Array.isArray(body.body_temperature)) {
    for (const item of body.body_temperature) {
      if (!isObj(item)) continue;
      const val = (item as any).temperature ?? (item as any).celsius;
      if (!add("body_temperature", val, "°C", parseTime(item.time))) break;
    }
  }

  // respiratory_rate: [{ rate | breaths_per_minute, time }]
  if (Array.isArray(body.respiratory_rate)) {
    for (const item of body.respiratory_rate) {
      if (!isObj(item)) continue;
      const val = (item as any).rate ?? (item as any).breaths_per_minute;
      if (!add("respiratory_rate", val, "bpm", parseTime(item.time))) break;
    }
  }

  // distance: [{ distance | meters, start_time, end_time }]
  if (Array.isArray(body.distance)) {
    for (const item of body.distance) {
      if (!isObj(item)) continue;
      const val = (item as any).distance ?? (item as any).meters;
      if (!add("distance", val, "m", parseTime(item.start_time), parseTime(item.end_time))) break;
    }
  }

  // exercise: [{ duration_minutes | minutes, start_time, end_time }]
  if (Array.isArray(body.exercise)) {
    for (const item of body.exercise) {
      if (!isObj(item)) continue;
      const val = (item as any).duration_minutes ?? (item as any).minutes;
      if (!add("exercise", val, "min", parseTime(item.start_time), parseTime(item.end_time))) break;
    }
  }

  // hydration: [{ volume | ml, start_time, end_time }]
  if (Array.isArray(body.hydration)) {
    for (const item of body.hydration) {
      if (!isObj(item)) continue;
      const val = (item as any).volume ?? (item as any).ml;
      if (!add("hydration", val, "mL", parseTime(item.start_time), parseTime(item.end_time))) break;
    }
  }

  // heart_rate_variability: [{ ms | milliseconds, time }]
  if (Array.isArray(body.heart_rate_variability)) {
    for (const item of body.heart_rate_variability) {
      if (!isObj(item)) continue;
      const val = (item as any).ms ?? (item as any).milliseconds;
      if (!add("heart_rate_variability", val, "ms", parseTime(item.time))) break;
    }
  }

  // resting_heart_rate: [{ bpm, time }]
  if (Array.isArray(body.resting_heart_rate)) {
    for (const item of body.resting_heart_rate) {
      if (!isObj(item)) continue;
      if (!add("resting_heart_rate", item.bpm, "bpm", parseTime(item.time))) break;
    }
  }

  // height: [{ height | meters, time }]
  if (Array.isArray(body.height)) {
    for (const item of body.height) {
      if (!isObj(item)) continue;
      const val = (item as any).height ?? (item as any).meters;
      if (!add("height", val, "m", parseTime(item.time))) break;
    }
  }

  if (records.length === 0) {
    return Response.json({ ok: true, inserted: 0, message: "No valid records found" });
  }

  try {
    const inserted = insertMany(records);
    return Response.json({ ok: true, inserted, total_parsed: records.length });
  } catch (e: any) {
    console.error("[health-webhook] DB error:", e.message);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
