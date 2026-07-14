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

// ── 宿主进程：标题感知识别（issue #43）──────────────────────────────
// JVM 这类宿主进程自己不代表任何应用——Minecraft、JQuake、Ghidra 的前台
// 进程全都叫 javaw.exe，真实身份只能从窗口标题读。以前 app-names.json 里
// "javaw.exe" → "Minecraft" 的无条件映射把所有 Java 桌面程序都判成了挖矿。
// 只在写侧生效：report.ts 把识别结果当 fallbackLabel 传入 resolveAppMeta，
// 数据库里存的已是识别后的名字，读侧拿不到标题也不需要。
const HOST_PROCESS_IDS = new Set(["javaw.exe", "java.exe", "javaw", "java"]);

// 先具体后宽泛；返回规范名，让 status-texts 的精确文案接得上。
// Minecraft 放最前：官方标题 "Minecraft* 1.21.x"、第三方启动器（HMCL 的
// "Hello Minecraft! Launcher" 等）都含这个词。
const HOST_TITLE_SIGNATURES: Array<[RegExp, string]> = [
  [/minecraft/i, "Minecraft"],
  [/jquake/i, "JQuake"],
  [/ghidra/i, "Ghidra"],
  [/jadx/i, "jadx"],
  [/jdownloader/i, "JDownloader"],
  [/burp suite/i, "Burp Suite"],
  [/runelite/i, "RuneLite"],
  [/dbeaver/i, "DBeaver"],
  [/jmeter/i, "JMeter"],
  [/visualvm/i, "VisualVM"],
  [/arduino/i, "Arduino IDE"],
  [/jd-gui/i, "JD-GUI"],
];

/**
 * 宿主进程（JVM 等）的真实应用名识别。非宿主进程返回 undefined，
 * 走正常映射链。产出只作为 fallbackLabel 参与解析，所以 custom/
 * overrides 依然能覆盖它，SECRET 判定也照常作用于识别结果。
 */
export function resolveHostAppLabel(
  appId: string,
  windowTitle?: string
): string | undefined {
  if (!appId || !HOST_PROCESS_IDS.has(appId.toLowerCase())) return undefined;
  const title = (windowTitle ?? "").trim();
  if (!title) return "Java 应用";
  for (const [pattern, name] of HOST_TITLE_SIGNATURES) {
    if (pattern.test(title)) return name;
  }
  return guessAppNameFromTitle(title) ?? "Java 应用";
}

// 签名表没命中时从标题猜：Windows 标题惯例是「文档 - 应用名」，应用名在
// 最后一段（"README.md - Notepad++"）；单段标题通常本身就是应用名
// （"JQuake"）。尾部版本号剥掉（"JQuake 1.8.5" → "JQuake"）。取末段而非
// 全标题也是隐私考量：文档名/网页题留在前段，不会被当成应用名落库。
// 产出后续仍会过 sanitizeLabel 消毒。
function guessAppNameFromTitle(title: string): string | undefined {
  const parts = title.split(/\s+[-—–|·]\s+/);
  const last = (parts[parts.length - 1] ?? "")
    .trim()
    .replace(/\s+v?\d+(\.\d+)+\s*$/i, "")
    .trim();
  if (!last || last.length > 48) return undefined;
  return last;
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
      const last = parts[parts.length - 1] ?? appId;
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
