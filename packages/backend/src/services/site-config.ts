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
const DEFAULT_DASHBOARDS: DashboardProfile[] = [
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
];

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
    if (parsed.protocol !== "https:") return undefined;
    parsed.hash = "";
    parsed.search = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

function toDashboardProfile(value: unknown): DashboardProfile | undefined {
  if (!value || typeof value !== "object") return undefined;

  const record = value as Record<string, unknown>;
  const id = nonEmpty(typeof record.id === "string" ? record.id : undefined);
  const name = nonEmpty(typeof record.name === "string" ? record.name : undefined);
  const url = normalizeDashboardUrl(typeof record.url === "string" ? record.url : undefined);
  const description = nonEmpty(
    typeof record.description === "string" ? record.description : undefined,
  );

  if (!id || !name || !url) return undefined;

  return { id, name, url, description };
}

function getDashboards(): DashboardProfile[] {
  const raw = nonEmpty(process.env.EXTERNAL_DASHBOARDS);
  if (!raw) return DEFAULT_DASHBOARDS;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_DASHBOARDS;
    const dashboards = parsed
      .map((entry) => toDashboardProfile(entry))
      .filter((entry): entry is DashboardProfile => !!entry);
    return dashboards.length > 0 ? dashboards : DEFAULT_DASHBOARDS;
  } catch {
    return DEFAULT_DASHBOARDS;
  }
}

export function getSiteConfig(): SiteConfig {
  const displayName = nonEmpty(process.env.DISPLAY_NAME) ?? DEFAULT_DISPLAY_NAME;
  const siteTitle = nonEmpty(process.env.SITE_TITLE) ?? `${displayName} Now`;
  const siteDescription =
    nonEmpty(process.env.SITE_DESC) ?? `What is ${displayName} doing right now?`;
  const rawFavicon = nonEmpty(process.env.SITE_FAVICON) ?? DEFAULT_FAVICON;

  return {
    displayName,
    siteTitle,
    siteDescription,
    siteFavicon: isValidFaviconUrl(rawFavicon) ? rawFavicon : DEFAULT_FAVICON,
    dashboards: getDashboards(),
  };
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
