import { getTimelineByDate, upsertDailySummary } from "../db";

/**
 * AI Daily Summary Generator
 *
 * Env vars (all optional — if not set, generation is silently skipped):
 *   AI_API_URL   — OpenAI-compatible chat endpoint (e.g. https://api.openai.com/v1/chat/completions)
 *   AI_API_KEY   — Bearer token for the API
 *   AI_MODEL     — Model name (default: gpt-4o-mini)
 */

const AI_API_URL = process.env.AI_API_URL || "";
const AI_API_KEY = process.env.AI_API_KEY || "";
const AI_MODEL = process.env.AI_MODEL || "gpt-4o-mini";

const SYSTEM_PROMPT = `你是一个简洁文艺的日记助手。根据用户今天在各设备上的应用使用记录，写一段50-80字的中文日总结。
要求：
- 语气温暖、自然，像朋友随笔
- 提炼这一天的节奏和主题，不要逐条罗列
- 不要使用 emoji
- 不要超过80字`;

interface ActivityRow {
  device_name: string;
  app_name: string;
  display_title: string;
  started_at: string;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildUserPrompt(rows: ActivityRow[]): string {
  // Aggregate by device → app → total mentions + titles
  const byDevice = new Map<string, Map<string, { count: number; titles: Set<string> }>>();
  for (const r of rows) {
    let dev = byDevice.get(r.device_name);
    if (!dev) { dev = new Map(); byDevice.set(r.device_name, dev); }
    let app = dev.get(r.app_name);
    if (!app) { app = { count: 0, titles: new Set() }; dev.set(r.app_name, app); }
    app.count++;
    if (r.display_title) app.titles.add(r.display_title);
  }

  const lines: string[] = [`日期: ${todayStr()}`];
  for (const [dev, apps] of byDevice) {
    lines.push(`\n[${dev}]`);
    const sorted = Array.from(apps.entries()).sort((a, b) => b[1].count - a[1].count);
    for (const [app, { count, titles }] of sorted.slice(0, 8)) {
      const t = titles.size ? ` (${Array.from(titles).slice(0, 3).join(", ")})` : "";
      lines.push(`  ${app}: ${count}条记录${t}`);
    }
  }
  return lines.join("\n");
}

export async function generateDailySummary(): Promise<void> {
  if (!AI_API_URL || !AI_API_KEY) {
    return; // AI not configured, skip silently
  }

  const date = todayStr();
  const rows = getTimelineByDate.all(date) as ActivityRow[];
  if (rows.length === 0) {
    console.log("[ai-summary] No activity data for today, skipping");
    return;
  }

  const userPrompt = buildUserPrompt(rows);

  try {
    const res = await fetch(AI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 200,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      console.error(`[ai-summary] API returned ${res.status}: ${await res.text()}`);
      return;
    }

    const data = await res.json();
    const summary = data?.choices?.[0]?.message?.content?.trim();
    if (!summary) {
      console.error("[ai-summary] Empty response from AI");
      return;
    }

    upsertDailySummary.run(date, summary);
    console.log(`[ai-summary] Generated summary for ${date}: ${summary.slice(0, 60)}...`);
  } catch (e) {
    console.error("[ai-summary] Failed to generate:", e);
  }
}
