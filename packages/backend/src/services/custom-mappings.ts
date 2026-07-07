/**
 * 用户自定义应用映射加载器。
 *
 * 内置的 app-names.json / status-text.ts 覆盖不了所有应用，这里允许部署者
 * 提供一个 JSON 文件来补充或覆盖内置映射（用户条目优先于内置条目）。
 *
 * 联动关系：
 *   - app-mapper.ts 在解析应用名/文案时最先查询本模块
 *   - 文件路径由环境变量 CUSTOM_MAPPINGS_FILE 指定，
 *     未设置时尝试 ./data/custom-mappings.json（Docker 里即 /data 卷）
 *   - 仓库根目录的 custom-mappings.example.json 是可直接抄的示例
 *
 * 文件格式（所有段都可省略）：
 * {
 *   "windows": { "someapp.exe":  { "name": "某应用", "statusText": "正在搞事情喵~" } },
 *   "android": { "com.foo.bar":  { "name": "某应用" } },
 *   "macos":   { "SomeApp":      { "statusText": "正在忙喵~" } },
 *   "statusTexts": { "某应用": "正在搞事情喵~" }
 * }
 *
 * 平台段按 app_id（进程名/包名，大小写不敏感）匹配；statusTexts 段按映射后的
 * 应用名匹配，用于给内置映射产出的名字换文案。非法条目会被跳过并打印警告。
 */
import { existsSync, readFileSync } from "fs";
import path from "path";

export interface CustomOverrideEntry {
  name?: string;
  statusText?: string;
}

const MAX_ENTRIES_PER_SECTION = 500;
const MAX_KEY_LENGTH = 160;
const MAX_NAME_LENGTH = 64;
const MAX_STATUS_TEXT_LENGTH = 128;

const PLATFORMS = ["windows", "android", "macos"] as const;
type Platform = (typeof PLATFORMS)[number];

const customByPlatform: Record<Platform, Map<string, CustomOverrideEntry>> = {
  windows: new Map(),
  android: new Map(),
  macos: new Map(),
};
const customStatusTexts = new Map<string, string>();

function cleanString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return undefined;
  return trimmed;
}

function loadPlatformSection(platform: Platform, raw: unknown): number {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return 0;

  let loaded = 0;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (loaded >= MAX_ENTRIES_PER_SECTION) {
      console.warn(`[custom-mappings] ${platform}: 超过 ${MAX_ENTRIES_PER_SECTION} 条上限，其余忽略`);
      break;
    }
    const appId = cleanString(key, MAX_KEY_LENGTH);
    if (!appId || !value || typeof value !== "object" || Array.isArray(value)) {
      console.warn(`[custom-mappings] ${platform}: 跳过非法条目 "${key}"`);
      continue;
    }
    const record = value as Record<string, unknown>;
    const entry: CustomOverrideEntry = {
      name: cleanString(record.name, MAX_NAME_LENGTH),
      statusText: cleanString(record.statusText, MAX_STATUS_TEXT_LENGTH),
    };
    if (!entry.name && !entry.statusText) {
      console.warn(`[custom-mappings] ${platform}: "${key}" 缺少 name/statusText，跳过`);
      continue;
    }
    customByPlatform[platform].set(appId.toLowerCase(), entry);
    loaded++;
  }
  return loaded;
}

function loadStatusTextSection(raw: unknown): number {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return 0;

  let loaded = 0;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (loaded >= MAX_ENTRIES_PER_SECTION) break;
    const appName = cleanString(key, MAX_NAME_LENGTH);
    const text = cleanString(value, MAX_STATUS_TEXT_LENGTH);
    if (!appName || !text) {
      console.warn(`[custom-mappings] statusTexts: 跳过非法条目 "${key}"`);
      continue;
    }
    customStatusTexts.set(appName.toLowerCase(), text);
    loaded++;
  }
  return loaded;
}

function resolveMappingsPath(): string | null {
  const fromEnv = process.env.CUSTOM_MAPPINGS_FILE?.trim();
  if (fromEnv) return fromEnv;
  const fallback = path.join(process.cwd(), "data", "custom-mappings.json");
  return existsSync(fallback) ? fallback : null;
}

(function load() {
  const file = resolveMappingsPath();
  if (!file) return;
  if (!existsSync(file)) {
    console.warn(`[custom-mappings] 文件不存在：${file}`);
    return;
  }

  try {
    const parsed = JSON.parse(readFileSync(file, "utf-8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      console.warn("[custom-mappings] 顶层必须是对象，已忽略整个文件");
      return;
    }
    let total = 0;
    for (const platform of PLATFORMS) {
      total += loadPlatformSection(platform, parsed[platform]);
    }
    total += loadStatusTextSection(parsed.statusTexts);
    if (total > 0) {
      console.log(`[custom-mappings] 已加载 ${total} 条自定义映射（${file}）`);
    }
  } catch (e: any) {
    console.warn(`[custom-mappings] 解析失败，已忽略：${e.message}`);
  }
})();

/** 按 app_id 查用户自定义条目（大小写不敏感）；无自定义时返回 undefined。 */
export function getCustomOverride(
  appId: string,
  platform: string
): CustomOverrideEntry | undefined {
  if (!appId) return undefined;
  if (platform !== "windows" && platform !== "android" && platform !== "macos") {
    return undefined;
  }
  return customByPlatform[platform].get(appId.toLowerCase());
}

/** 按映射后的应用名查用户自定义文案；无自定义时返回 undefined。 */
export function getCustomStatusText(appName: string): string | undefined {
  if (!appName) return undefined;
  return customStatusTexts.get(appName.toLowerCase());
}
