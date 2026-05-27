import type { DeviceInfo } from "../types";
import { authenticateToken } from "../middleware/auth";
import { resolveAppName } from "../services/app-mapper";
import { processDisplayTitle } from "../services/privacy-tiers";
import { isNSFW } from "../services/nsfw-filter";
import { insertActivity, upsertDeviceState, hmacTitle } from "../db";

const MAX_TITLE_LENGTH = 256;

// NSFW filter can be disabled via environment variable (default: enabled)
const NSFW_FILTER_ENABLED = process.env.NSFW_FILTER_DISABLED !== "true";

/**
 * Core report processing logic — shared by HTTP and WebSocket handlers.
 * Returns true if the report was processed successfully.
 */
export function processReportBody(body: any, device: DeviceInfo): { ok: boolean; error?: string } {
  const appId = typeof body.app_id === "string" ? body.app_id.trim() : "";
  if (!appId) {
    return { ok: false, error: "app_id required" };
  }

  // Truncate window_title
  let windowTitle =
    typeof body.window_title === "string" ? body.window_title : "";
  if (windowTitle.length > MAX_TITLE_LENGTH) {
    windowTitle = windowTitle.slice(0, MAX_TITLE_LENGTH);
  }

  // Validate client timestamp (optional, used for display only)
  let startedAt: string;
  if (typeof body.timestamp === "string" && body.timestamp) {
    const ts = new Date(body.timestamp);
    const now = Date.now();
    if (!isNaN(ts.getTime()) && Math.abs(ts.getTime() - now) < 5 * 60 * 1000) {
      startedAt = ts.toISOString();
    } else {
      startedAt = new Date().toISOString();
    }
  } else {
    startedAt = new Date().toISOString();
  }

  // Resolve app name
  const appName = resolveAppName(appId, device.platform);

  // NSFW filter: silently discard if content matches blocklist
  if (NSFW_FILTER_ENABLED && isNSFW(appId, windowTitle)) {
    return { ok: true }; // Silent discard — don't reveal filter to client
  }

  // Privacy: generate display_title (safe for public), then discard raw window_title
  const displayTitle = processDisplayTitle(appName, windowTitle);

  // Dedup: HMAC hash of the original title (keyed, not reversible)
  const timeBucket = Math.floor(Date.now() / 10000);
  const titleHash = hmacTitle(windowTitle.toLowerCase().trim());

  // Parse extra (battery, device metadata, music, etc.) — whitelist fields first, then serialize
  let extraJson = "{}";
  if (body.extra && typeof body.extra === "object" && !Array.isArray(body.extra)) {
    const extra: Record<string, unknown> = {};
    if (typeof body.extra.battery_percent === "number" && Number.isFinite(body.extra.battery_percent)) {
      extra.battery_percent = Math.max(0, Math.min(100, Math.round(body.extra.battery_percent)));
    }
    if (typeof body.extra.battery_charging === "boolean") {
      extra.battery_charging = body.extra.battery_charging;
    }
    const rawMusic = body.extra.music;
    if (rawMusic != null && typeof rawMusic === "object" && !Array.isArray(rawMusic)) {
      const music: Record<string, string> = {};
      if (typeof rawMusic.title === "string") music.title = rawMusic.title.slice(0, 256);
      if (typeof rawMusic.artist === "string") music.artist = rawMusic.artist.slice(0, 256);
      if (typeof rawMusic.app === "string") music.app = rawMusic.app.slice(0, 64);
      if (Object.keys(music).length > 0) {
        extra.music = music;
      }
    }
    // Device metadata (network, vpn, capability mode, etc.)
    const rawDevice = body.extra.device;
    if (rawDevice != null && typeof rawDevice === "object" && !Array.isArray(rawDevice)) {
      const deviceMeta: Record<string, unknown> = {};
      if (typeof rawDevice.network_connected === "boolean") {
        deviceMeta.network_connected = rawDevice.network_connected;
      }
      if (typeof rawDevice.network_type === "string" && rawDevice.network_type) {
        deviceMeta.network_type = rawDevice.network_type.slice(0, 64);
      }
      if (typeof rawDevice.cellular_generation === "string" && rawDevice.cellular_generation) {
        deviceMeta.cellular_generation = rawDevice.cellular_generation.slice(0, 64);
      }
      if (typeof rawDevice.vpn_active === "boolean") {
        deviceMeta.vpn_active = rawDevice.vpn_active;
      }
      if (typeof rawDevice.vpn_name === "string") {
        deviceMeta.vpn_name = rawDevice.vpn_name.slice(0, 64);
      }
      if (typeof rawDevice.capability_mode === "string") {
        deviceMeta.capability_mode = rawDevice.capability_mode.slice(0, 32);
      }
      if (typeof rawDevice.device_kind === "string") {
        deviceMeta.device_kind = rawDevice.device_kind.slice(0, 32);
      }
      if (typeof rawDevice.last_sample_at === "string") {
        deviceMeta.last_sample_at = rawDevice.last_sample_at;
      }
      if (Object.keys(deviceMeta).length > 0) {
        extra.device = deviceMeta;
      }
    }
    // Location data
    const rawLocation = body.extra.location;
    if (rawLocation != null && typeof rawLocation === "object" && !Array.isArray(rawLocation)) {
      const loc: Record<string, unknown> = {};
      if (typeof rawLocation.latitude === "number" && Number.isFinite(rawLocation.latitude)) {
        loc.latitude = rawLocation.latitude;
      }
      if (typeof rawLocation.longitude === "number" && Number.isFinite(rawLocation.longitude)) {
        loc.longitude = rawLocation.longitude;
      }
      if (typeof rawLocation.accuracy_m === "number" && Number.isFinite(rawLocation.accuracy_m)) {
        loc.accuracy_m = rawLocation.accuracy_m;
      }
      if (typeof rawLocation.provider === "string") {
        loc.provider = rawLocation.provider.slice(0, 64);
      }
      if (typeof rawLocation.recorded_at === "string") {
        loc.recorded_at = rawLocation.recorded_at;
      }
      if (Object.keys(loc).length > 0) {
        extra.location = loc;
      }
    }
    extraJson = JSON.stringify(extra);
  }

  // Insert activity — window_title is NEVER stored (privacy: empty string)
  try {
    insertActivity.run(
      device.device_id,
      device.device_name,
      device.platform,
      appId,
      appName,
      "",           // window_title: always empty for privacy
      displayTitle,
      titleHash,
      timeBucket,
      startedAt
    );
  } catch (e: any) {
    if (!e.message?.includes("UNIQUE constraint")) {
      console.error("[report] DB insert error:", e.message);
    }
  }

  // Always update device state (even if activity was deduped)
  try {
    upsertDeviceState.run(
      device.device_id,
      device.device_name,
      device.platform,
      appId,
      appName,
      "",           // window_title: always empty for privacy
      displayTitle,
      new Date().toISOString(),
      extraJson
    );
  } catch (e: any) {
    console.error("[report] Device state update error:", e.message);
    return { ok: false, error: "Internal error" };
  }

  return { ok: true };
}

export async function handleReport(req: Request): Promise<Response> {
  // Auth
  const device = authenticateToken(req.headers.get("authorization"));
  if (!device) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse body
  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = processReportBody(body, device);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  return Response.json({ ok: true });
}
