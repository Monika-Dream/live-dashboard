import { getDailySummary } from "../db";

export function handleDailySummary(url: URL): Response {
  const date = url.searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: "Missing or invalid date param (YYYY-MM-DD)" }, { status: 400 });
  }

  const row = getDailySummary.get(date) as { date: string; summary: string; generated_at: string } | null;

  if (!row) {
    return Response.json({ date, summary: null, generated_at: null });
  }

  return Response.json(row);
}
