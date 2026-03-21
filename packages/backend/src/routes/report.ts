import { authenticateToken } from "../middleware/auth";
import { resolveAppName } from "../services/app-mapper";
import { isNSFW } from "../services/nsfw-filter";
import { processDisplayTitle } from "../services/privacy-tiers";
import { insertActivity, insertMusicHistory, upsertDeviceState, hmacTitle } from "../db";

const MAX_TITLE_LENGTH = 256;

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

  // Parse extra (battery, etc.) — whitelist fields first, then serialize
  let extraJson = "{}";
  let musicForHistory: Record<string, unknown> | null = null;
  if (body.extra && typeof body.extra === "object" && !Array.isArray(body.extra)) {
    const extra: Record<string, unknown> = {};
    if (typeof body.extra.battery_percent === "number" && Number.isFinite(body.extra.battery_percent)) {
      extra.battery_percent = Math.max(0, Math.min(100, Math.round(body.extra.battery_percent)));
    }
    if (typeof body.extra.battery_charging === "boolean") {
      extra.battery_charging = body.extra.battery_charging;
    }
    
    // Music from body.extra.music — 完整保留所有字段
    const rawMusic = body.extra.music;
    if (rawMusic != null && typeof rawMusic === "object" && !Array.isArray(rawMusic)) {
      const music: Record<string, unknown> = {};
      if (typeof rawMusic.title === "string") music.title = rawMusic.title.slice(0, 256);
      if (typeof rawMusic.artist === "string") music.artist = rawMusic.artist.slice(0, 256);
      if (typeof rawMusic.album === "string") music.album = rawMusic.album.slice(0, 256);
      if (typeof rawMusic.app === "string") music.app = rawMusic.app.slice(0, 64);
      if (typeof rawMusic.playing === "boolean") music.playing = rawMusic.playing;
      if (typeof rawMusic.duration === "number") music.duration = rawMusic.duration;
      if (typeof rawMusic.elapsedTime === "number") music.elapsedTime = rawMusic.elapsedTime;
      if (typeof rawMusic.bundleIdentifier === "string") music.bundleIdentifier = rawMusic.bundleIdentifier;
      if (Object.keys(music).length > 0) {
        extra.music = music;
        musicForHistory = music;
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

  if (musicForHistory?.title && typeof musicForHistory.title === "string") {
    try {
      const title = musicForHistory.title;
      const artist = typeof musicForHistory.artist === "string" ? musicForHistory.artist : "";
      const album = typeof musicForHistory.album === "string" ? musicForHistory.album : "";
      const app = typeof musicForHistory.app === "string" ? musicForHistory.app : "QQ音乐";
      const playing = musicForHistory.playing === false ? 0 : 1;
      const musicHash = hmacTitle(`${app}\n${title}\n${artist}\n${album}`.toLowerCase().trim());
      const musicTimeBucket = Math.floor(Date.now() / 30000);

      insertMusicHistory.run(
        device.device_id,
        device.device_name,
        device.platform,
        app,
        title,
        artist,
        album,
        playing,
        musicHash,
        musicTimeBucket,
        startedAt
      );
    } catch (e: any) {
      if (!e.message?.includes("UNIQUE constraint")) {
        console.error("[report] Music history insert error:", e.message);
      }
    }
  }

  return Response.json({ ok: true });
}
