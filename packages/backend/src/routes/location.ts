import { db } from "../db";
import type { LocationRecord } from "../types";

function timezoneModifier(url: URL): string | null {
  const tzParam = url.searchParams.get("tz");
  const tzOffsetMinutes = tzParam ? parseInt(tzParam, 10) : 0;
  if (!tzOffsetMinutes || isNaN(tzOffsetMinutes) || Math.abs(tzOffsetMinutes) > 840) {
    return null;
  }

  const offsetHours = -tzOffsetMinutes / 60;
  const sign = offsetHours >= 0 ? "+" : "-";
  const absH = Math.floor(Math.abs(offsetHours));
  const absM = Math.round((Math.abs(offsetHours) - absH) * 60);
  return `${sign}${String(absH).padStart(2, "0")}:${String(absM).padStart(2, "0")}`;
}

export function handleLocationQuery(url: URL): Response {
  const date = url.searchParams.get("date");
  const deviceId = url.searchParams.get("device_id");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: "date parameter required (YYYY-MM-DD)" }, { status: 400 });
  }

  try {
    const modifier = timezoneModifier(url);
    let records: LocationRecord[];

    if (modifier) {
      if (deviceId) {
        records = db.prepare(`
          SELECT device_id, latitude, longitude, accuracy_m, provider, recorded_at
          FROM location_records
          WHERE date(recorded_at, '${modifier}') = ? AND device_id = ?
          ORDER BY recorded_at ASC
        `).all(date, deviceId) as LocationRecord[];
      } else {
        records = db.prepare(`
          SELECT device_id, latitude, longitude, accuracy_m, provider, recorded_at
          FROM location_records
          WHERE date(recorded_at, '${modifier}') = ?
          ORDER BY recorded_at ASC
        `).all(date) as LocationRecord[];
      }
    } else {
      const startOfDay = `${date}T00:00:00.000Z`;
      const d = new Date(startOfDay);
      if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== date) {
        return Response.json({ error: "Invalid date" }, { status: 400 });
      }
      d.setUTCDate(d.getUTCDate() + 1);
      const startOfNextDay = d.toISOString();

      if (deviceId) {
        records = db.prepare(`
          SELECT device_id, latitude, longitude, accuracy_m, provider, recorded_at
          FROM location_records
          WHERE recorded_at >= ? AND recorded_at < ? AND device_id = ?
          ORDER BY recorded_at ASC
        `).all(startOfDay, startOfNextDay, deviceId) as LocationRecord[];
      } else {
        records = db.prepare(`
          SELECT device_id, latitude, longitude, accuracy_m, provider, recorded_at
          FROM location_records
          WHERE recorded_at >= ? AND recorded_at < ?
          ORDER BY recorded_at ASC
        `).all(startOfDay, startOfNextDay) as LocationRecord[];
      }
    }

    return Response.json({ date, records });
  } catch (e: any) {
    console.error("[location] Query error:", e.message);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
