/*
 * 状态文案解析：应用名 → 面板上那句戏剧化的"正在干什么喵~"。
 *
 * 文案数据全部住在 ../data/status-texts.json（精确条目 + 启发式规则 + 兜底），
 * 抽成独立 JSON 就是为了让部署者不碰代码也能改梗——文件里自带格式说明。
 * 本文件只负责加载、校验和查询。
 *
 * 查询优先级：exact 精确匹配（大小写不敏感）→ heuristics 正则启发 → default。
 * 用户级覆盖（CUSTOM_MAPPINGS_FILE）在 app-mapper.ts 里处理，优先级高于本库。
 */
import statusTextsData from "../data/status-texts.json";

interface StatusTextsFile {
  exact?: Record<string, string>;
  heuristics?: Array<[string, string, string]>;
  default?: string;
  idle?: string;
}

const data = statusTextsData as unknown as StatusTextsFile;

export const DEFAULT_STATUS_TEXT =
  typeof data.default === "string" && data.default ? data.default : "正在忙别的喵~";

const IDLE_STATUS_TEXT =
  typeof data.idle === "string" && data.idle ? data.idle : "暂时离开了喵~";

// 精确条目：小写索引，展示名大小写差异不影响命中
const lowerIndex = new Map<string, string>();
for (const [key, value] of Object.entries(data.exact ?? {})) {
  if (typeof value === "string" && value) {
    lowerIndex.set(key.toLowerCase(), value);
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

  return (
    lowerIndex.get(normalized.toLowerCase()) ??
    getHeuristicStatusText(normalized) ??
    DEFAULT_STATUS_TEXT
  );
}
