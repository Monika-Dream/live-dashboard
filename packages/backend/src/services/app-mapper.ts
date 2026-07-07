import appNamesData from "../data/app-names.json";
import { appOverrides } from "../data/app-overrides";
import { DEFAULT_STATUS_TEXT, getStatusText } from "./status-text";

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

type SupportedPlatform = "windows" | "android" | "macos";

function normalizePlatform(platform: string): SupportedPlatform | null {
  if (platform === "windows" || platform === "android" || platform === "macos") {
    return platform;
  }
  return null;
}

function getOverride(appId: string, platform: string) {
  const normalizedPlatform = normalizePlatform(platform);
  if (!normalizedPlatform || !appId) return undefined;
  return appOverrides[normalizedPlatform][appId.toLowerCase()];
}

function resolveBaseAppName(
  appId: string,
  platform: string
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
    const found = androidMap.get(lower);
    if (found) return found;
    if (appId.includes(".")) {
      const parts = appId.split(".");
      const last = parts[parts.length - 1];
      return last.charAt(0).toUpperCase() + last.slice(1);
    }
    return appId;
  }

  // macos: System Events already returns human-readable names (e.g. "Google Chrome").
  // Only a few process names need remapping (e.g. "Code" → "Visual Studio Code").
  const found = macosMap.get(lower);
  return found ?? appId;
}

export function resolveAppName(
  appId: string,
  platform: string
): string {
  const override = getOverride(appId, platform);
  if (override?.name) return override.name;
  return resolveBaseAppName(appId, platform);
}

export function resolveAppMeta(appId: string, platform: string) {
  const override = getOverride(appId, platform);
  const baseAppName = resolveBaseAppName(appId, platform);
  const appName = override?.name ?? baseAppName;
  const overrideNameStatusText = override?.name
    ? getStatusText(override.name)
    : DEFAULT_STATUS_TEXT;
  return {
    appName,
    statusText:
      override?.statusText ??
      (overrideNameStatusText !== DEFAULT_STATUS_TEXT
        ? overrideNameStatusText
        : getStatusText(baseAppName)),
  };
}
