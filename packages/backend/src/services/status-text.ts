/*
 * 状态文案解析：应用名 → 面板上那句戏剧化的"正在干什么喵~"。
 *
 * 文案数据全部住在 ../data/status-texts.json（精确条目 + 启发式规则 + 兜底），
 * 抽成独立 JSON 就是为了让部署者不碰代码也能改梗——文件里自带格式说明。
 * 本文件只负责加载、校验和查询。
 *
 * 精确条目的值可以是字符串，也可以是字符串数组——数组按 30 分钟时间桶
 * 稳定随机轮换（同一时段内固定，避免前端轮询时文案闪跳）。
 *
 * 查询优先级：exact 精确匹配（大小写不敏感）→ heuristics 正则启发 → default。
 * 用户级覆盖（CUSTOM_MAPPINGS_FILE）在 app-mapper.ts 里处理，优先级高于本库。
 */
import statusTextsData from "../data/status-texts.json";

interface StatusTextsFile {
  exact?: Record<string, string | string[]>;
  heuristics?: Array<[string, string, string]>;
  default?: string;
  idle?: string;
}

const data = statusTextsData as unknown as StatusTextsFile;

export const DEFAULT_STATUS_TEXT =
  typeof data.default === "string" && data.default ? data.default : "正在忙别的喵~";

const IDLE_STATUS_TEXT =
  typeof data.idle === "string" && data.idle ? data.idle : "暂时离开了喵~";

// 精确条目：小写索引，展示名大小写差异不影响命中；值保留数组形态，查询时再挑
const lowerIndex = new Map<string, string | string[]>();
for (const [key, value] of Object.entries(data.exact ?? {})) {
  if (typeof value === "string" && value) {
    lowerIndex.set(key.toLowerCase(), value);
  } else if (Array.isArray(value)) {
    const variants = value.filter((v) => typeof v === "string" && v);
    if (variants.length > 0) lowerIndex.set(key.toLowerCase(), variants);
  }
}

// 启发式规则：[正则, flags, 文案]，加载时编译，坏正则跳过并告警而不是拖垮启动
const heuristics: Array<[RegExp, string]> = [];
for (const entry of data.heuristics ?? []) {
  if (!Array.isArray(entry) || entry.length < 3) continue;
  const [pattern, flags, text] = entry;
  if (typeof pattern !== "string" || typeof text !== "string" || !text) continue;
  try {
    heuristics.push([new RegExp(pattern, typeof flags === "string" ? flags : ""), text]);
  } catch (e: any) {
    console.warn(`[status-text] 跳过无效启发式正则 "${pattern}": ${e.message}`);
  }
}

/** 时间桶宽度：多条文案的应用每约 30 分钟轮换一条。 */
const VARIANT_BUCKET_MS = 30 * 60 * 1000;

/**
 * 从多条文案里挑一条：按「时间桶 + 应用名」做稳定 hash。
 * 同一时段内同一应用的文案固定（前端 5 秒轮询不会闪跳），
 * 跨时段自然换梗，不需要任何持久化状态。
 */
function pickVariant(appName: string, variants: string[]): string {
  const bucket = Math.floor(Date.now() / VARIANT_BUCKET_MS);
  let h = bucket;
  for (let i = 0; i < appName.length; i++) {
    h = (h * 31 + appName.charCodeAt(i)) | 0;
  }
  return variants[Math.abs(h) % variants.length] ?? variants[0]!;
}

function getHeuristicStatusText(appName: string): string | undefined {
  for (const [pattern, text] of heuristics) {
    if (pattern.test(appName)) return text;
  }
  return undefined;
}

export function getStatusText(appName: string): string {
  if (!appName) return DEFAULT_STATUS_TEXT;
  const normalized = appName.trim();
  if (!normalized) return DEFAULT_STATUS_TEXT;

  if (normalized.toLowerCase() === "idle") {
    return IDLE_STATUS_TEXT;
  }

  const hit = lowerIndex.get(normalized.toLowerCase());
  if (typeof hit === "string") return hit;
  if (Array.isArray(hit)) return pickVariant(normalized, hit);

  return getHeuristicStatusText(normalized) ?? DEFAULT_STATUS_TEXT;
}
