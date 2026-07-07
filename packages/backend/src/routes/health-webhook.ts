import { authenticateToken } from "../middleware/auth";
import { canReportHealth, db } from "../db";

/**
 * Accepts health data in two external formats and transforms both into
 * internal health_records rows:
 *
 * 1. health-connect-webhook (https://github.com/mcnaveen/health-connect-webhook)
 * {
 *   "timestamp": "2026-03-22T07:41:59Z",
 *   "app_version": "1.0",
 *   "steps": [{ "count": 3202, "start_time": "...", "end_time": "..." }],
 *   "heart_rate": [{ "bpm": 61, "time": "..." }],
 *   "oxygen_saturation": [{ "percentage": 98.0, "time": "..." }],
 *   "active_calories": [{ "calories": 45.0, "start_time": "...", "end_time": "..." }],
 *   "total_calories": [{ "calories": 1575.75, "start_time": "...", "end_time": "..." }]
 * }
 *
 * 2. Apple 健康 via「Health Auto Export」iOS App 的 REST API 导出
 *    （iPhone / Apple Watch 用户不装我们的 App 也能上报健康数据）
 * {
 *   "data": {
 *     "metrics": [
 *       { "name": "heart_rate", "units": "bpm",
 *         "data": [{ "date": "2026-07-08 10:00:00 +0800", "Avg": 61 }] },
 *       { "name": "step_count", "units": "steps",
 *         "data": [{ "date": "...", "qty": 3202 }] },
 *       { "name": "sleep_analysis",
 *         "data": [{ "sleepStart": "...", "sleepEnd": "...", "asleep": 7.5 }] }
 *     ]
 *   }
 * }
 * 通过 body.data.metrics 是否存在来识别格式；用法见 docs/wearables-health-guide.md
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

// Health Auto Export 的日期形如 "2026-07-08 10:00:00 +0800"，
// 不是合法 ISO；先归一化成 "2026-07-08T10:00:00+08:00" 再交给 Date
function parseAppleTime(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  const normalized = raw
    .replace(/^(\d{4}-\d{2}-\d{2}) /, "$1T")
    .replace(/ ([+-])(\d{2}):?(\d{2})$/, "$1$2:$3");
  return parseTime(normalized) ?? parseTime(raw);
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

  // ── 格式 2：Apple 健康（Health Auto Export）──
  const appleMetrics = isObj(body.data) && Array.isArray((body.data as any).metrics)
    ? ((body.data as any).metrics as unknown[])
    : null;

  if (appleMetrics) {
    // HAE 指标名 → 内部类型；单位换算在 value 回调里做
    const metricMap: Record<string, { type: string; unit: string; convert?: (v: number, units: string) => number }> = {
      heart_rate: { type: "heart_rate", unit: "bpm" },
      resting_heart_rate: { type: "resting_heart_rate", unit: "bpm" },
      heart_rate_variability: { type: "heart_rate_variability", unit: "ms" },
      step_count: { type: "steps", unit: "count" },
      walking_running_distance: {
        type: "distance", unit: "m",
        convert: (v, units) => (units === "km" ? v * 1000 : v),
      },
      active_energy: {
        type: "active_calories", unit: "kcal",
        convert: (v, units) => (units.toLowerCase() === "kj" ? v / 4.184 : v),
      },
      blood_oxygen_saturation: { type: "oxygen_saturation", unit: "%" },
      respiratory_rate: { type: "respiratory_rate", unit: "bpm" },
      body_temperature: { type: "body_temperature", unit: "°C" },
      blood_glucose: { type: "blood_glucose", unit: "mmol/L" },
      weight_body_mass: {
        type: "weight", unit: "kg",
        convert: (v, units) => (units === "lb" ? v * 0.453592 : v),
      },
      dietary_water: {
        type: "hydration", unit: "mL",
        convert: (v, units) => (units === "L" ? v * 1000 : v),
      },
    };

    outer: for (const metric of appleMetrics) {
      if (!isObj(metric) || typeof metric.name !== "string" || !Array.isArray(metric.data)) continue;
      const units = typeof metric.units === "string" ? metric.units : "";

      // sleep_analysis 结构特殊（asleep 小时数 + sleepStart/sleepEnd），单独处理
      if (metric.name === "sleep_analysis") {
        for (const item of metric.data) {
          if (!isObj(item)) continue;
          const hours = typeof item.asleep === "number" ? item.asleep : (item as any).inBed;
          const start = parseAppleTime((item as any).sleepStart ?? item.date);
          const end = parseAppleTime((item as any).sleepEnd);
          if (typeof hours !== "number") continue;
          if (!add("sleep", hours * 60, "min", start, end)) break outer;
        }
        continue;
      }

      // blood_pressure 每条带 systolic/diastolic，存收缩压（与 Android 端一致）
      if (metric.name === "blood_pressure") {
        for (const item of metric.data) {
          if (!isObj(item)) continue;
          if (!add("blood_pressure", (item as any).systolic, "mmHg", parseAppleTime(item.date))) break outer;
        }
        continue;
      }

      const mapped = metricMap[metric.name];
      if (!mapped) continue; // 未支持的指标静默跳过

      for (const item of metric.data) {
        if (!isObj(item)) continue;
        // 数值字段因指标而异：qty 最常见，心率类是 Avg/Min/Max
        const rawValue = (item as any).qty ?? (item as any).Avg ?? (item as any).avg;
        const value = typeof rawValue === "number" && mapped.convert
          ? mapped.convert(rawValue, units)
          : rawValue;
        if (!add(mapped.type, value, mapped.unit, parseAppleTime(item.date))) break outer;
      }
    }

    if (records.length === 0) {
      return Response.json({ ok: true, inserted: 0, message: "No valid records found" });
    }
    try {
      const inserted = insertMany(records);
      return Response.json({ ok: true, inserted, total_parsed: records.length, format: "apple-health-auto-export" });
    } catch (e: any) {
      console.error("[health-webhook] DB error:", e.message);
      return Response.json({ error: "Internal error" }, { status: 500 });
    }
  }

  // ── 格式 1：health-connect-webhook ──

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
