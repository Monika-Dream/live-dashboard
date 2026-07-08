import { authenticateToken } from "../middleware/auth";
import { resolveAppMeta } from "../services/app-mapper";
import { isNSFW } from "../services/nsfw-filter";
import { isSecretApp, processDisplayTitle, SECRET_APP_NAME } from "../services/privacy-tiers";
import { canReportActivity, insertActivity, upsertDeviceState, hmacTitle } from "../db";

const MAX_TITLE_LENGTH = 256;

export async function handleReport(req: Request): Promise<Response> {
  // Auth
  const device = authenticateToken(req.headers.get("authorization"));
  if (!device) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canReportActivity(device.device_id)) {
    return Response.json(
      { error: "Consent required: activity_reporting" },
      { status: 403 }
    );
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

  // 客户端上报的本机应用显示名（如 Android PackageManager 的 label）。
  // 仅作为映射表未命中时的名称兜底，长度与内容在 resolveAppMeta 里再消毒。
  const appLabel =
    typeof body.app_label === "string" ? body.app_label.trim().slice(0, 64) : undefined;

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

  // Resolve app name（app_label 作为映射未命中时的兜底，secret 判定同样覆盖它）
  let { appName } = resolveAppMeta(appId, device.platform, appLabel);
  let effectiveAppId = appId;

  // 私密应用（银行/密码管理器等）：写入前整体匿名化，app_id/标题一概不落库。
  // "正在用某某银行"这个事实本身就是敏感信息，时长保留、内容清零。
  // resolveAppMeta 在读侧已把 secret 应用改名为 SECRET_APP_NAME，
  // 这里按结果名判断，把原始 app_id 一并抹掉。
  if (appName === SECRET_APP_NAME || isSecretApp(appName)) {
    effectiveAppId = "private";
    appName = SECRET_APP_NAME;
    windowTitle = "";
  }

  // Privacy: generate display_title (safe for public), then discard raw window_title
  const displayTitle = processDisplayTitle(appName, windowTitle);

  // Dedup: HMAC hash of the original title (keyed, not reversible)
  const timeBucket = Math.floor(Date.now() / 10000);
  const titleHash = hmacTitle(windowTitle.toLowerCase().trim());

  // Parse extra (battery, etc.) — whitelist fields first, then serialize
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
    extraJson = JSON.stringify(extra);
  }

  // Insert activity — window_title is NEVER stored (privacy: empty string)
  try {
    insertActivity.run(
      device.device_id,
      device.device_name,
      device.platform,
      effectiveAppId,
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
      effectiveAppId,
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
