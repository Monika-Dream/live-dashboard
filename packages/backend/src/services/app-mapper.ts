import appNamesData from "../data/app-names.json";

const PACKAGE_LIKE_RE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+){1,}$/i;
const GENERIC_ANDROID_SEGMENTS = new Set([
  "app",
  "main",
  "launcher",
  "home",
  "android",
  "mobile",
  "client",
]);

// Build case-insensitive lookup maps
const windowsMap = new Map<string, string>();
for (const [key, value] of Object.entries(appNamesData.windows)) {
  windowsMap.set(key.toLowerCase(), value);
}

const androidMap = new Map<string, string>();
for (const [key, value] of Object.entries(appNamesData.android)) {
  androidMap.set(key.toLowerCase(), value);
}

const macosMap = new Map<string, string>();
for (const [key, value] of Object.entries(appNamesData.macos)) {
  macosMap.set(key.toLowerCase(), value);
}

function normalizeAndroidAppId(appId: string): string {
  return appId.split("/")[0]?.trim() || appId;
}

function isPackageLike(value: string): boolean {
  return PACKAGE_LIKE_RE.test(value.trim());
}

function isMeaningfulAndroidLabel(label: string | undefined, appId: string): boolean {
  if (!label) return false;
  const trimmed = label.trim();
  if (!trimmed || trimmed.length < 2) return false;
  if (trimmed.toLowerCase() === appId.toLowerCase()) return false;
  if (isPackageLike(trimmed)) return false;
  return true;
}

function humanizeAndroidAppId(appId: string): string | null {
  if (!isPackageLike(appId)) return null;
  const parts = appId.split(".").filter(Boolean);
  if (parts.length === 0) return null;

  let segment = parts[parts.length - 1] || "";
  if (GENERIC_ANDROID_SEGMENTS.has(segment.toLowerCase()) && parts.length > 1) {
    segment = parts[parts.length - 2] || segment;
  }

  const spaced = segment
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();

  if (!spaced) return null;
  return spaced.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function resolveAppName(
  appId: string,
  platform: "windows" | "android" | "macos",
  reportedAppName?: string,
): string {
  if (!appId || typeof appId !== "string") return "Unknown";
  const lower = appId.toLowerCase();

  if (platform === "windows") {
    const found = windowsMap.get(lower);
    if (found) return found;
    if (lower.endsWith(".exe")) return appId.replace(/\.exe$/i, "");
    return appId;
  }

  if (platform === "android") {
    const normalizedAppId = normalizeAndroidAppId(appId);
    const normalizedLower = normalizedAppId.toLowerCase();

    const found = androidMap.get(normalizedLower) ?? androidMap.get(lower);
    if (found) return found;

    if (isMeaningfulAndroidLabel(reportedAppName, normalizedAppId)) {
      return reportedAppName!.trim();
    }

    const humanized = humanizeAndroidAppId(normalizedAppId);
    if (humanized) return humanized;

    return appId;
  }

  // macos: System Events already returns human-readable names (e.g. "Google Chrome").
  // Only a few process names need remapping (e.g. "Code" → "Visual Studio Code").
  const found = macosMap.get(lower);
  return found ?? appId;
}
