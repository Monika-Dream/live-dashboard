import { getSiteConfig } from "../services/site-config";

type ProxyEndpoint = "current" | "timeline" | "health-data" | "config";

const ALLOWED_ENDPOINTS = new Set<ProxyEndpoint>([
  "current",
  "timeline",
  "health-data",
  "config",
]);

const ALLOWED_QUERY_KEYS: Record<ProxyEndpoint, string[]> = {
  current: [],
  config: [],
  timeline: ["date", "tz"],
  "health-data": ["date", "tz", "device_id"],
};

function getDashboardUrl(dashboardId: string): string | null {
  const dashboards = getSiteConfig().dashboards;
  const match = dashboards.find((dashboard) => dashboard.id === dashboardId);
  return match?.url ?? null;
}

function buildTargetUrl(baseUrl: string, endpoint: ProxyEndpoint, requestUrl: URL): string {
  const target = new URL(`/api/${endpoint}`, baseUrl);
  for (const key of ALLOWED_QUERY_KEYS[endpoint]) {
    const value = requestUrl.searchParams.get(key);
    if (value) target.searchParams.set(key, value);
  }
  return target.toString();
}

export async function handleProxy(url: URL): Promise<Response> {
  const dashboardId = url.searchParams.get("dashboard_id")?.trim() || "";
  const endpointRaw = url.searchParams.get("endpoint")?.trim() || "";

  if (!dashboardId || !endpointRaw) {
    return Response.json({ error: "Missing dashboard_id or endpoint" }, { status: 400 });
  }

  if (!ALLOWED_ENDPOINTS.has(endpointRaw as ProxyEndpoint)) {
    return Response.json({ error: "Unsupported endpoint" }, { status: 400 });
  }

  const endpoint = endpointRaw as ProxyEndpoint;
  const baseUrl = getDashboardUrl(dashboardId);
  if (!baseUrl) {
    return Response.json({ error: "Unknown dashboard" }, { status: 404 });
  }

  const targetUrl = buildTargetUrl(baseUrl, endpoint, url);

  try {
    const upstream = await fetch(targetUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(6000),
    });

    const body = await upstream.arrayBuffer();
    const headers = new Headers();
    headers.set(
      "Content-Type",
      upstream.headers.get("content-type") || "application/json; charset=utf-8",
    );
    headers.set("Cache-Control", "no-store");

    return new Response(body, {
      status: upstream.status,
      headers,
    });
  } catch {
    return Response.json({ error: "Upstream unavailable" }, { status: 502 });
  }
}
