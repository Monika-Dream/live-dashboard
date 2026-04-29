import { deleteExternalDashboard, hideExternalDashboard, upsertExternalDashboard } from "../db";
import { ensureAdminAuthorized } from "../middleware/admin";
import {
  deleteAdminDeviceConfig,
  getAdminDeviceConfigs,
  upsertAdminDeviceConfig,
} from "../middleware/auth";
import { getSiteConfig } from "../services/site-config";
import { normalizeDashboardProfileInput } from "../services/site-config";
import { updateSiteConfigFromAdmin } from "../services/site-config";

export function handleConfig(): Response {
  return Response.json(getSiteConfig());
}

export function handleAdminVerify(req: Request): Response {
  const unauthorized = ensureAdminAuthorized(req);
  if (unauthorized) return unauthorized;
  return Response.json({ ok: true });
}

export function handleAdminConfigGet(req: Request): Response {
  const unauthorized = ensureAdminAuthorized(req);
  if (unauthorized) return unauthorized;

  const site = getSiteConfig();
  return Response.json({
    site: {
      displayName: site.displayName,
      siteTitle: site.siteTitle,
      siteDescription: site.siteDescription,
    },
    devices: getAdminDeviceConfigs(),
  });
}

export async function handleAdminSiteUpdate(req: Request): Promise<Response> {
  const unauthorized = ensureAdminAuthorized(req);
  if (unauthorized) return unauthorized;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const site = updateSiteConfigFromAdmin(body);
  if (!site) {
    return Response.json({ error: "Invalid site config payload" }, { status: 400 });
  }

  return Response.json({
    ok: true,
    site: {
      displayName: site.displayName,
      siteTitle: site.siteTitle,
      siteDescription: site.siteDescription,
    },
  });
}

export async function handleAdminDeviceUpsert(req: Request): Promise<Response> {
  const unauthorized = ensureAdminAuthorized(req);
  if (unauthorized) return unauthorized;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Invalid device payload" }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;
  const ok = upsertAdminDeviceConfig({
    token: typeof payload.token === "string" ? payload.token : "",
    device_id: typeof payload.device_id === "string" ? payload.device_id : "",
    device_name: typeof payload.device_name === "string" ? payload.device_name : "",
    platform: typeof payload.platform === "string" ? payload.platform : "",
  });

  if (!ok) {
    return Response.json({ error: "Invalid token/device/platform" }, { status: 400 });
  }

  return Response.json({ ok: true, devices: getAdminDeviceConfigs() });
}

export async function handleAdminDeviceDelete(req: Request): Promise<Response> {
  const unauthorized = ensureAdminAuthorized(req);
  if (unauthorized) return unauthorized;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const deviceId = typeof (body as { device_id?: unknown })?.device_id === "string"
    ? (body as { device_id: string }).device_id
    : "";

  if (!deviceId.trim()) {
    return Response.json({ error: "device_id required" }, { status: 400 });
  }

  const removed = deleteAdminDeviceConfig(deviceId);
  if (!removed) {
    return Response.json(
      { error: "Runtime config not found for this device_id" },
      { status: 404 },
    );
  }

  return Response.json({ ok: true, devices: getAdminDeviceConfigs() });
}

export async function handleDashboardCreate(req: Request): Promise<Response> {
  const unauthorized = ensureAdminAuthorized(req);
  if (unauthorized) return unauthorized;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const dashboard = normalizeDashboardProfileInput(body);
  if (!dashboard) {
    return Response.json({ error: "Invalid dashboard payload" }, { status: 400 });
  }

  upsertExternalDashboard(dashboard);
  return Response.json({ ok: true, dashboards: getSiteConfig().dashboards });
}

export async function handleDashboardDelete(req: Request): Promise<Response> {
  const unauthorized = ensureAdminAuthorized(req);
  if (unauthorized) return unauthorized;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = typeof (body as { id?: unknown })?.id === "string"
    ? (body as { id: string }).id.trim()
    : "";

  if (!id) {
    return Response.json({ error: "id required" }, { status: 400 });
  }

  const before = getSiteConfig().dashboards;
  const exists = before.some((dashboard) => dashboard.id === id);
  if (!exists) {
    return Response.json({ error: "Dashboard not found" }, { status: 404 });
  }

  const changes = deleteExternalDashboard(id);
  if (changes === 0) {
    // If the dashboard comes from EXTERNAL_DASHBOARDS env, mark it hidden at runtime.
    hideExternalDashboard(id);
  }

  return Response.json({ ok: true, dashboards: getSiteConfig().dashboards });
}
