import { deleteExternalDashboard, hideExternalDashboard, upsertExternalDashboard } from "../db";
import { ensureAdminAuthorized } from "../middleware/admin";
import { getSiteConfig } from "../services/site-config";
import { normalizeDashboardProfileInput } from "../services/site-config";

export function handleConfig(): Response {
  return Response.json(getSiteConfig());
}

export function handleAdminVerify(req: Request): Response {
  const unauthorized = ensureAdminAuthorized(req);
  if (unauthorized) return unauthorized;
  return Response.json({ ok: true });
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
