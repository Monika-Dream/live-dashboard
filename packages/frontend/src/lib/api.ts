const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";

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
  const res = await fetch(buildApiUrl("/api/current", options), { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
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
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
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
  dashboards: [
    {
      id: "aloys23",
      name: "DBJD-CR",
      url: "https://livedashboard.aloys23.link",
      description: "Aloys23 的实时面板",
    },
    {
      id: "ailucat",
      name: "八九四",
      url: "https://live.ailucat.top",
      description: "Ailucat 的实时面板",
    },
    {
      id: "fun91",
      name: "Monika",
      url: "https://live.91fun.asia",
      description: "91fun 的实时面板",
    },
  ],
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  if (signal?.aborted) {
    clearTimeout(timeout);
    return defaultConfig;
  }
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetch(buildApiUrl("/api/config", options), { signal: controller.signal });
    if (!res.ok) return defaultConfig;
    const data = await res.json();
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
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
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
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
