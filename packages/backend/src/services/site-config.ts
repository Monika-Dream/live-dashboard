import {
  deleteRuntimeSiteSetting,
  getExternalDashboards,
  getHiddenExternalDashboardIds,
  getRuntimeSiteSettings,
  upsertRuntimeSiteSetting,
} from "../db";

export interface SiteConfig {
  displayName: string;
  siteTitle: string;
  siteDescription: string;
  siteFavicon: string;
  dashboards: DashboardProfile[];
}

export interface DashboardProfile {
  id: string;
  name: string;
  url: string;
  description?: string;
}

export const DISPLAY_NAME_PLACEHOLDER = "__LIVE_DASHBOARD_DISPLAY_NAME__";
export const SITE_TITLE_PLACEHOLDER = "__LIVE_DASHBOARD_SITE_TITLE__";
export const SITE_DESCRIPTION_PLACEHOLDER = "__LIVE_DASHBOARD_SITE_DESCRIPTION__";
export const SITE_FAVICON_PLACEHOLDER = "/__LIVE_DASHBOARD_SITE_FAVICON__";

const DEFAULT_DISPLAY_NAME = "xuyihong";
const DEFAULT_FAVICON = "/favicon.ico";
const SCRIPT_TAG_PATTERN = /<script\b[^>]*>[\s\S]*?<\/script>/gi;
const DEFAULT_DASHBOARDS: DashboardProfile[] = [];
const RESERVED_DASHBOARD_ID = "local";
const RUNTIME_DISPLAY_NAME_KEY = "display_name";
const RUNTIME_SITE_TITLE_KEY = "site_title";
const RUNTIME_SITE_DESC_KEY = "site_description";

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isValidFaviconUrl(url: string): boolean {
  if (url.startsWith("/") && !url.startsWith("//")) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeDashboardUrl(url: string | undefined): string | undefined {
  const trimmed = nonEmpty(url);
  if (!trimmed) return undefined;

  try {
    const parsed = new URL(trimmed);
    // Allow http for LAN/local deployments; https remains recommended for public dashboards.
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return undefined;

    // Always pin external links to the dashboard site's main entry
    // so nested routes/query-selected subpanels do not break proxy calls.
    return parsed.origin;
  } catch {
    return undefined;
  }
}

function normalizeDashboardId(id: string | undefined): string | undefined {
  const trimmed = nonEmpty(id);
  if (!trimmed) return undefined;
  if (trimmed.toLowerCase() === RESERVED_DASHBOARD_ID) return undefined;
  return trimmed;
}

function parseDashboardList(raw: string): unknown[] {
  const candidates: string[] = [raw];

  const quoted = raw.match(/^(["'])([\s\S]*)\1$/);
  if (quoted?.[2]) {
    candidates.push(quoted[2]);
  }

  if (raw.includes('""')) {
    candidates.push(raw.replaceAll('""', '"'));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Continue trying other candidate formats.
    }
  }

  return [];
}

function toDashboardProfile(value: unknown): DashboardProfile | undefined {
  if (!value || typeof value !== "object") return undefined;

  const record = value as Record<string, unknown>;
  const id = normalizeDashboardId(typeof record.id === "string" ? record.id : undefined);
  const name = nonEmpty(typeof record.name === "string" ? record.name : undefined);
  const url = normalizeDashboardUrl(typeof record.url === "string" ? record.url : undefined);
  const description = nonEmpty(
    typeof record.description === "string" ? record.description : undefined,
  );

  if (!id || !name || !url) return undefined;

  return { id, name, url, description };
}

export function normalizeDashboardProfileInput(value: unknown): DashboardProfile | null {
  return toDashboardProfile(value) ?? null;
}

function mergeDashboards(
  primary: DashboardProfile[],
  secondary: DashboardProfile[],
): DashboardProfile[] {
  const uniqueDashboards = new Map<string, DashboardProfile>();
  for (const dashboard of primary) {
    if (!uniqueDashboards.has(dashboard.id)) {
      uniqueDashboards.set(dashboard.id, dashboard);
    }
  }
  for (const dashboard of secondary) {
    if (!uniqueDashboards.has(dashboard.id)) {
      uniqueDashboards.set(dashboard.id, dashboard);
    }
  }
  return Array.from(uniqueDashboards.values());
}

function getDashboards(): DashboardProfile[] {
  const raw = nonEmpty(process.env.EXTERNAL_DASHBOARDS);
  const hiddenIds = new Set(getHiddenExternalDashboardIds());
  const fromDb = getExternalDashboards()
    .map((record) => {
      const normalizedUrl = normalizeDashboardUrl(record.url);
      if (!normalizedUrl) return null;
      return {
        id: record.id,
        name: record.name,
        url: normalizedUrl,
        description: record.description,
      };
    })
    .filter((dashboard): dashboard is DashboardProfile => !!dashboard)
    .filter((dashboard) => !hiddenIds.has(dashboard.id));

  if (!raw) {
    return fromDb.length > 0 ? fromDb : DEFAULT_DASHBOARDS;
  }

  const parsed = parseDashboardList(raw);
  if (parsed.length === 0) {
    return fromDb.length > 0 ? fromDb : DEFAULT_DASHBOARDS;
  }

  const uniqueDashboards = new Map<string, DashboardProfile>();
  for (const entry of parsed) {
    const dashboard = toDashboardProfile(entry);
    if (!dashboard) continue;
    if (!uniqueDashboards.has(dashboard.id)) {
      uniqueDashboards.set(dashboard.id, dashboard);
    }
  }

  const fromEnv = uniqueDashboards.size > 0
    ? Array.from(uniqueDashboards.values())
    : DEFAULT_DASHBOARDS;

  const visibleEnv = fromEnv.filter((dashboard) => !hiddenIds.has(dashboard.id));

  const merged = mergeDashboards(fromDb, visibleEnv);
  return merged.length > 0 ? merged : DEFAULT_DASHBOARDS;
}
export function getSiteConfig(): SiteConfig {
  const runtimeSettings = getRuntimeSiteSettings();
  const displayName =
    nonEmpty(runtimeSettings[RUNTIME_DISPLAY_NAME_KEY]) ??
    nonEmpty(process.env.DISPLAY_NAME) ??
    DEFAULT_DISPLAY_NAME;
  const siteTitle =
    nonEmpty(runtimeSettings[RUNTIME_SITE_TITLE_KEY]) ??
    nonEmpty(process.env.SITE_TITLE) ??
    `${displayName} Now`;
  const siteDescription =
    nonEmpty(runtimeSettings[RUNTIME_SITE_DESC_KEY]) ??
    nonEmpty(process.env.SITE_DESC) ??
    `What is ${displayName} doing right now?`;
  const rawFavicon = nonEmpty(process.env.SITE_FAVICON) ?? DEFAULT_FAVICON;

  return {
    displayName,
    siteTitle,
    siteDescription,
    siteFavicon: isValidFaviconUrl(rawFavicon) ? rawFavicon : DEFAULT_FAVICON,
    dashboards: getDashboards(),
  };
}

function updateRuntimeStringSetting(
  key: string,
  value: unknown,
  maxLength: number,
): boolean {
  if (value === undefined) return true;
  if (typeof value !== "string") return false;

  const trimmed = value.trim();
  if (!trimmed) {
    deleteRuntimeSiteSetting(key);
    return true;
  }

  upsertRuntimeSiteSetting(key, trimmed.slice(0, maxLength));
  return true;
}

export function updateSiteConfigFromAdmin(input: unknown): SiteConfig | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const payload = input as Record<string, unknown>;
  const isDisplayNameOk = updateRuntimeStringSetting(
    RUNTIME_DISPLAY_NAME_KEY,
    payload.displayName,
    64,
  );
  const isSiteTitleOk = updateRuntimeStringSetting(
    RUNTIME_SITE_TITLE_KEY,
    payload.siteTitle,
    120,
  );
  const isSiteDescriptionOk = updateRuntimeStringSetting(
    RUNTIME_SITE_DESC_KEY,
    payload.siteDescription,
    240,
  );

  if (!isDisplayNameOk || !isSiteTitleOk || !isSiteDescriptionOk) {
    return null;
  }

  return getSiteConfig();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeJsString(value: string): string {
  return JSON.stringify(value)
    .slice(1, -1)
    .replaceAll("<", "\\u003C")
    .replaceAll(">", "\\u003E")
    .replaceAll("&", "\\u0026");
}

function replacePlaceholders(
  input: string,
  config: SiteConfig,
  escapeValue: (value: string) => string,
): string {
  return input
    .replaceAll(DISPLAY_NAME_PLACEHOLDER, escapeValue(config.displayName))
    .replaceAll(SITE_TITLE_PLACEHOLDER, escapeValue(config.siteTitle))
    .replaceAll(SITE_DESCRIPTION_PLACEHOLDER, escapeValue(config.siteDescription))
    .replaceAll(SITE_FAVICON_PLACEHOLDER, escapeValue(config.siteFavicon));
}

export function injectSiteConfig(html: string): string {
  const config = getSiteConfig();
  let result = "";
  let lastIndex = 0;

  for (const match of html.matchAll(SCRIPT_TAG_PATTERN)) {
    const index = match.index ?? 0;
    const script = match[0];

    result += replacePlaceholders(html.slice(lastIndex, index), config, escapeHtml);
    result += replacePlaceholders(script, config, escapeJsString);
    lastIndex = index + script.length;
  }

  result += replacePlaceholders(html.slice(lastIndex), config, escapeHtml);
  return result;
}
