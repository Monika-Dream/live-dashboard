const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";
const API_TIMEOUT_MS = 6000;
const CONFIG_TIMEOUT_MS = 3000;

export interface DashboardProfile {
  id: string;
  name: string;
  url: string;
  description?: string;
}

export interface DashboardRequestOptions {
  baseUrl?: string;
  dashboardId?: string;
}

export interface DashboardMutationPayload {
  id: string;
  name: string;
  url: string;
  description?: string;
}

function normalizeBaseUrl(baseUrl?: string): string {
  const target = (baseUrl ?? API_BASE).trim();
  return target.replace(/\/$/, "");
}

function buildApiUrl(path: string, options?: DashboardRequestOptions): string {
  const dashboardId = options?.dashboardId?.trim();
  if (dashboardId) {
    const endpoint = path.replace(/^\/api\//, "");
    const params = new URLSearchParams({
      dashboard_id: dashboardId,
      endpoint,
    });
    return `/api/proxy?${params.toString()}`;
  }

  const baseUrl = normalizeBaseUrl(options?.baseUrl);
  return `${baseUrl}${path}`;
}

function withQuery(url: string, params: URLSearchParams): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}${params.toString()}`;
}

async function fetchJsonWithTimeout<T>(
  url: string,
  signal?: AbortSignal,
  timeoutMs: number = API_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  if (signal?.aborted) {
    clearTimeout(timeoutId);
    throw new DOMException("Aborted", "AbortError");
  }

  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<T>;
  } catch (error) {
    if (timedOut) {
      throw new Error("Request timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", onAbort);
  }
}

export interface DeviceState {
  device_id: string;
  device_name: string;
  platform: string;
  app_id: string;
  app_name: string;
  display_title?: string;
  last_seen_at: string;
  is_online: number;
  extra?: {
    battery_percent?: number;
    battery_charging?: boolean;
    custom_app_name?: string;
    custom_description?: string;
    music?: {
      title?: string;
      artist?: string;
      app?: string;
    };
  };
}

export interface ActivityRecord {
  id: number;
  device_id: string;
  device_name: string;
  platform: string;
  app_id: string;
  app_name: string;
  display_title?: string;
  started_at: string;
}

export interface TimelineSegment {
  app_name: string;
  app_id: string;
  display_title?: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number;
  device_id: string;
  device_name: string;
}

export interface CurrentResponse {
  devices: DeviceState[];
  recent_activities: ActivityRecord[];
  server_time: string;
  viewer_count: number;
}

export interface TimelineResponse {
  date: string;
  segments: TimelineSegment[];
  summary: Record<string, Record<string, number>>;
}

export async function fetchCurrent(
  signal?: AbortSignal,
  options?: DashboardRequestOptions,
): Promise<CurrentResponse> {
  return fetchJsonWithTimeout<CurrentResponse>(buildApiUrl("/api/current", options), signal);
}

export async function fetchTimeline(
  date: string,
  signal?: AbortSignal,
  options?: DashboardRequestOptions,
): Promise<TimelineResponse> {
  const tz = new Date().getTimezoneOffset();
  const params = new URLSearchParams({
    date,
    tz: String(tz),
  });
  const url = withQuery(buildApiUrl("/api/timeline", options), params);
  return fetchJsonWithTimeout<TimelineResponse>(url, signal);
}

export interface HealthRecord {
  device_id: string;
  type: string;
  value: number;
  unit: string;
  recorded_at: string;
  end_time: string;
}

export interface HealthDataResponse {
  date: string;
  records: HealthRecord[];
}

export interface SiteConfig {
  displayName: string;
  siteTitle: string;
  siteDescription: string;
  siteFavicon: string;
  dashboards: DashboardProfile[];
}

const defaultConfig: SiteConfig = {
  displayName: "xuyihong",
  siteTitle: "xuyihong Now",
  siteDescription: "What is xuyihong doing right now?",
  siteFavicon: "/favicon.ico",
  dashboards: [],
};

export { defaultConfig };

function isValidFaviconUrl(url: string): boolean {
  if (url.startsWith("/") && !url.startsWith("//")) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeDashboardProfile(value: unknown): DashboardProfile | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    typeof record.name !== "string" ||
    typeof record.url !== "string"
  ) {
    return null;
  }

  return {
    id: record.id,
    name: record.name,
    url: record.url.replace(/\/$/, ""),
    description: typeof record.description === "string" ? record.description : undefined,
  };
}

export async function fetchConfig(
  signal?: AbortSignal,
  options?: DashboardRequestOptions,
): Promise<SiteConfig> {
  try {
    const data = await fetchJsonWithTimeout<Record<string, unknown>>(
      buildApiUrl("/api/config", options),
      signal,
      CONFIG_TIMEOUT_MS,
    );
    const favicon = typeof data.siteFavicon === "string" && isValidFaviconUrl(data.siteFavicon)
      ? data.siteFavicon
      : defaultConfig.siteFavicon;
    const dashboards = Array.isArray(data.dashboards)
      ? data.dashboards
          .map((entry: unknown) => normalizeDashboardProfile(entry))
          .filter((entry: DashboardProfile | null): entry is DashboardProfile => !!entry)
      : defaultConfig.dashboards;
    return {
      displayName: typeof data.displayName === "string" ? data.displayName : defaultConfig.displayName,
      siteTitle: typeof data.siteTitle === "string" ? data.siteTitle : defaultConfig.siteTitle,
      siteDescription: typeof data.siteDescription === "string" ? data.siteDescription : defaultConfig.siteDescription,
      siteFavicon: favicon,
      dashboards: dashboards.length > 0 ? dashboards : defaultConfig.dashboards,
    };
  } catch {
    return defaultConfig;
  }
}

export async function fetchHealthData(
  date: string,
  signal?: AbortSignal,
  deviceId?: string,
  options?: DashboardRequestOptions,
): Promise<HealthDataResponse> {
  const tz = new Date().getTimezoneOffset();
  const params = new URLSearchParams({
    date,
    tz: String(tz),
  });
  if (deviceId) params.set("device_id", deviceId);
  const url = withQuery(buildApiUrl("/api/health-data", options), params);
  return fetchJsonWithTimeout<HealthDataResponse>(url, signal);
}

function buildAdminHeaders(adminToken: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${adminToken.trim()}`,
  };
}

async function parseApiError(res: Response): Promise<string> {
  try {
    const data = await res.json() as { error?: unknown };
    if (typeof data.error === "string" && data.error.trim()) {
      return data.error.trim();
    }
  } catch {
    // Ignore JSON parse errors and fallback to status text.
  }
  return `HTTP ${res.status}`;
}

function parseDashboardsResponse(data: unknown): DashboardProfile[] {
  if (!data || typeof data !== "object") return [];
  const raw = (data as { dashboards?: unknown }).dashboards;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item: unknown) => normalizeDashboardProfile(item))
    .filter((item): item is DashboardProfile => !!item);
}

export async function createDashboard(
  payload: DashboardMutationPayload,
  adminToken: string,
): Promise<DashboardProfile[]> {
  const res = await fetch(buildApiUrl("/api/config/dashboards"), {
    method: "POST",
    headers: buildAdminHeaders(adminToken),
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!res.ok) throw new Error(await parseApiError(res));
  return parseDashboardsResponse(await res.json());
}

export async function verifyAdminToken(adminToken: string): Promise<void> {
  const res = await fetch(buildApiUrl("/api/config/verify"), {
    method: "POST",
    headers: buildAdminHeaders(adminToken),
    cache: "no-store",
  });

  if (!res.ok) throw new Error(await parseApiError(res));
}

export async function removeDashboard(id: string, adminToken: string): Promise<DashboardProfile[]> {
  const res = await fetch(buildApiUrl("/api/config/dashboards"), {
    method: "DELETE",
    headers: buildAdminHeaders(adminToken),
    body: JSON.stringify({ id }),
    cache: "no-store",
  });

  if (!res.ok) throw new Error(await parseApiError(res));
  return parseDashboardsResponse(await res.json());
}
