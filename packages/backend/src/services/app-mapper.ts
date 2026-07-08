import appNamesData from "../data/app-names.json";
import { appOverrides } from "../data/app-overrides";
import { getCustomOverride, getCustomStatusText } from "./custom-mappings";
import { isSecretApp, SECRET_APP_NAME } from "./privacy-tiers";
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
  platform: string,
  fallbackLabel?: string
): string {
  if (!appId || typeof appId !== "string") return "Unknown";
  const lower = appId.toLowerCase();

  if (platform === "windows") {
    const found = windowsMap.get(lower);
    if (found) return found;
    if (fallbackLabel) return fallbackLabel;
    if (lower.endsWith(".exe")) return appId.replace(/\.exe$/i, "");
    return appId;
  }

  if (platform === "android") {
    const found = androidMap.get(lower);
    if (found) return found;
    // 设备上报的本机应用显示名兜底——内置表不可能穷举所有安装的应用，
    // 但 PackageManager 查到的 label 对任何已安装应用都是准确的
    if (fallbackLabel) return fallbackLabel;
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
  return found ?? fallbackLabel ?? appId;
}

export function resolveAppName(
  appId: string,
  platform: string,
  fallbackLabel?: string
): string {
  const custom = getCustomOverride(appId, platform);
  if (custom?.name) return custom.name;
  const override = getOverride(appId, platform);
  if (override?.name) return override.name;
  return resolveBaseAppName(appId, platform, fallbackLabel);
}

// 名称与文案的优先级（高 → 低）：
//   用户自定义 JSON（custom-mappings）→ 代码内 appOverrides → 内置 app-names
//   → 设备上报的应用显示名（fallbackLabel）→ 包名末段
// fallbackLabel 有两个来源：写侧是客户端上报的 app_label（PackageManager 的真实
// 显示名），读侧是当时写库时已解析好的 app_name——映射决策始终只发生在服务端。
// 解析完成后做私密应用兜底：金融/密码类应用统一显示为 SECRET_APP_NAME，
// 覆盖升级前入库的历史数据（新数据在 report.ts 写入时就已改写）。
export function resolveAppMeta(appId: string, platform: string, fallbackLabel?: string) {
  const label = sanitizeLabel(fallbackLabel);
  const custom = getCustomOverride(appId, platform);
  const override = getOverride(appId, platform);
  const baseAppName = resolveBaseAppName(appId, platform, label);
  const appName = custom?.name ?? override?.name ?? baseAppName;

  if (isSecretApp(appName) || isSecretApp(baseAppName) || (label && isSecretApp(label))) {
    return { appName: SECRET_APP_NAME, statusText: getStatusText(SECRET_APP_NAME) };
  }

  const statusText =
    custom?.statusText ??
    getCustomStatusText(appName) ??
    override?.statusText ??
    firstNonDefault(
      custom?.name ? getStatusText(custom.name) : DEFAULT_STATUS_TEXT,
      override?.name ? getStatusText(override.name) : DEFAULT_STATUS_TEXT,
      getStatusText(baseAppName)
    );

  return { appName, statusText };
}

function firstNonDefault(...candidates: string[]): string {
  for (const candidate of candidates) {
    if (candidate !== DEFAULT_STATUS_TEXT) return candidate;
  }
  return DEFAULT_STATUS_TEXT;
}

/** 客户端上报的 label 是不可信输入：控制长度、剔除控制字符后才参与解析。 */
function sanitizeLabel(label?: string): string | undefined {
  if (!label || typeof label !== "string") return undefined;
  const cleaned = label.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 64);
  return cleaned || undefined;
}
