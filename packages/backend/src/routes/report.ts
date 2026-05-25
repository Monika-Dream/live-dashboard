import { authenticateToken } from "../middleware/auth";
import { resolveAppName } from "../services/app-mapper";
import { isNSFW } from "../services/nsfw-filter";
import { processDisplayTitle } from "../services/privacy-tiers";
import { insertActivity, insertLocationRecord, upsertDeviceState, hmacTitle } from "../db";

const MAX_TITLE_LENGTH = 256;
const MAX_SHORT_LENGTH = 64;
const MAX_MEDIUM_LENGTH = 256;
const VALID_SOURCES = new Set(["normal", "root", "lsposed"]);

function cleanString(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return cleaned ? cleaned.slice(0, max) : undefined;
}

function cleanSource(value: unknown): "normal" | "root" | "lsposed" | undefined {
  return typeof value === "string" && VALID_SOURCES.has(value)
    ? value as "normal" | "root" | "lsposed"
    : undefined;
}

function cleanTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function cleanFiniteNumber(value: unknown, min: number, max: number): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : undefined;
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

  const appId = typeof body.app_id === "string" ? body.app_id.trim() : "";
  if (!appId) {
    return Response.json({ error: "app_id required" }, { status: 400 });
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
    // Accept if within ±5 minutes, otherwise use server time
    if (!isNaN(ts.getTime()) && Math.abs(ts.getTime() - now) < 5 * 60 * 1000) {
      startedAt = ts.toISOString();
    } else {
      startedAt = new Date().toISOString();
    }
  } else {
    startedAt = new Date().toISOString();
  }

  // NSFW filter - silently discard
  if (isNSFW(appId, windowTitle)) {
    return Response.json({ ok: true });
  }

  // Resolve app name
  const appName = resolveAppName(appId, device.platform);

  // Privacy: generate display_title (safe for public), then discard raw window_title
  const displayTitle = processDisplayTitle(appName, windowTitle);

  // Dedup: HMAC hash of the original title (keyed, not reversible)
  const timeBucket = Math.floor(Date.now() / 10000);
  const titleHash = hmacTitle(windowTitle.toLowerCase().trim());

  // Parse extra (battery, current foreground/input/media, etc.) — whitelist fields first, then serialize
  let extraJson = "{}";
  if (body.extra && typeof body.extra === "object" && !Array.isArray(body.extra)) {
    const extra: Record<string, unknown> = {};
    if (typeof body.extra.battery_percent === "number" && Number.isFinite(body.extra.battery_percent)) {
      extra.battery_percent = Math.max(0, Math.min(100, Math.round(body.extra.battery_percent)));
    }
    if (typeof body.extra.battery_charging === "boolean") {
      extra.battery_charging = body.extra.battery_charging;
    }

    const rawDevice = body.extra.device;
    if (rawDevice != null && typeof rawDevice === "object" && !Array.isArray(rawDevice)) {
      const deviceBody = rawDevice as Record<string, unknown>;
      const deviceExtra: Record<string, unknown> = {};
      if (typeof deviceBody.network_connected === "boolean") deviceExtra.network_connected = deviceBody.network_connected;
      if (typeof deviceBody.vpn_active === "boolean") deviceExtra.vpn_active = deviceBody.vpn_active;
      const vpnName = cleanString(deviceBody.vpn_name, MAX_SHORT_LENGTH);
      if (vpnName) deviceExtra.vpn_name = vpnName;
      const capabilityMode = cleanSource(deviceBody.capability_mode);
      if (capabilityMode) deviceExtra.capability_mode = capabilityMode;
      const lastSampleAt = cleanTimestamp(deviceBody.last_sample_at);
      if (lastSampleAt) deviceExtra.last_sample_at = lastSampleAt;
      if (Object.keys(deviceExtra).length > 0) extra.device = deviceExtra;
    }

    const rawLocation = body.extra.location;
    if (rawLocation != null && typeof rawLocation === "object" && !Array.isArray(rawLocation)) {
      const locationBody = rawLocation as Record<string, unknown>;
      const latitude = cleanFiniteNumber(locationBody.latitude, -90, 90);
      const longitude = cleanFiniteNumber(locationBody.longitude, -180, 180);
      if (latitude != null && longitude != null) {
        const recordedAt = cleanTimestamp(locationBody.recorded_at) || startedAt;
        const accuracy = cleanFiniteNumber(locationBody.accuracy_m, 0, 100_000);
        const provider = cleanString(locationBody.provider, MAX_SHORT_LENGTH) || "";
        extra.location = {
          latitude,
          longitude,
          ...(accuracy != null ? { accuracy_m: accuracy } : {}),
          ...(provider ? { provider } : {}),
          recorded_at: recordedAt,
        };
        try {
          insertLocationRecord.run(
            device.device_id,
            latitude,
            longitude,
            accuracy ?? null,
            provider,
            recordedAt
          );
        } catch (e: any) {
          if (!e.message?.includes("UNIQUE constraint")) {
            console.error("[report] Location insert error:", e.message);
          }
        }
      }
    }

    const rawForeground = body.extra.foreground;
    if (rawForeground != null && typeof rawForeground === "object" && !Array.isArray(rawForeground)) {
      const foregroundBody = rawForeground as Record<string, unknown>;
      const foreground: Record<string, unknown> = {};
      const packageName = cleanString(foregroundBody.package_name, MAX_SHORT_LENGTH);
      const appNameExtra = cleanString(foregroundBody.app_name, MAX_SHORT_LENGTH);
      const activity = cleanString(foregroundBody.activity, MAX_MEDIUM_LENGTH);
      const source = cleanSource(foregroundBody.source);
      if (packageName) foreground.package_name = packageName;
      if (appNameExtra) foreground.app_name = appNameExtra;
      if (activity) foreground.activity = activity;
      if (source) foreground.source = source;
      if (typeof foregroundBody.confidence === "number" && Number.isFinite(foregroundBody.confidence)) {
        foreground.confidence = Math.max(0, Math.min(1, foregroundBody.confidence));
      }
      if (Object.keys(foreground).length > 0) extra.foreground = foreground;
    }

    const rawInput = body.extra.input;
    if (rawInput != null && typeof rawInput === "object" && !Array.isArray(rawInput)) {
      const inputBody = rawInput as Record<string, unknown>;
      const input: Record<string, unknown> = {};
      if (typeof inputBody.input_active === "boolean") input.input_active = inputBody.input_active;
      if (typeof inputBody.is_typing === "boolean") input.is_typing = inputBody.is_typing;
      const source = cleanSource(inputBody.source);
      if (source) input.source = source;
      if (Object.keys(input).length > 0) extra.input = input;
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

    const rawMedia = body.extra.media;
    if (rawMedia != null && typeof rawMedia === "object" && !Array.isArray(rawMedia)) {
      const mediaBody = rawMedia as Record<string, unknown>;
      const media: Record<string, unknown> = {};
      if (typeof mediaBody.playing === "boolean") media.playing = mediaBody.playing;
      const title = cleanString(mediaBody.title, MAX_MEDIUM_LENGTH);
      const artist = cleanString(mediaBody.artist, MAX_MEDIUM_LENGTH);
      const mediaApp = cleanString(mediaBody.app, MAX_SHORT_LENGTH);
      const state = cleanString(mediaBody.state, MAX_SHORT_LENGTH);
      const source = cleanSource(mediaBody.source);
      if (title) media.title = title;
      if (artist) media.artist = artist;
      if (mediaApp) media.app = mediaApp;
      if (state) media.state = state;
      if (source) media.source = source;
      if (Object.keys(media).length > 0) extra.media = media;
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
    // Log but don't expose internals
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
    return Response.json({ error: "Internal error" }, { status: 500 });
  }

  return Response.json({ ok: true });
}
