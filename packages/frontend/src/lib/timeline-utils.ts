import type { TimelineSegment } from "@/lib/api";

const BROWSER_APPS = new Set([
  "Chrome",
  "Safari",
  "Firefox",
  "Edge",
  "Chromium",
  "Google Chrome",
  "Microsoft Edge",
  "Mozilla Firefox",
  "Opera",
  "Brave",
  "Vivaldi",
  "Arc",
]);

const MUSIC_APPS = new Set([
  "Spotify",
  "Apple Music",
  "Music",
  "QQ音乐",
  "QQ Music",
  "网易云音乐",
  "NetEase Music",
  "酷狗音乐",
  "酷我音乐",
  "foobar2000",
]);

export function isBrowserApp(appName: string): boolean {
  const lower = appName.toLowerCase();
  return (
    BROWSER_APPS.has(appName) ||
    lower.includes("chrome") ||
    lower.includes("safari") ||
    lower.includes("firefox") ||
    lower.includes("edge") ||
    lower.includes("arc")
  );
}

export function isMusicApp(appName: string): boolean {
  return MUSIC_APPS.has(appName);
}

export function formatClockTime(dateStr: string, withSeconds = false): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: withSeconds ? "2-digit" : undefined,
  });
}

export function formatDuration(minutes: number): string {
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function formatMinutesAgo(dateStr: string): string {
  const diff = Math.max(0, Date.now() - new Date(dateStr).getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  const remain = minutes % 60;
  return remain > 0 ? `${hours} 小时 ${remain} 分钟前` : `${hours} 小时前`;
}

export function getDurationSeconds(seg: TimelineSegment): number {
  const start = new Date(seg.started_at).getTime();
  const end = seg.ended_at ? new Date(seg.ended_at).getTime() : start + Math.max(0, seg.duration_minutes || 0) * 60000;
  return Math.max(0, Math.round((end - start) / 1000));
}

export function getSegmentEnd(seg: TimelineSegment): string {
  if (seg.ended_at) return seg.ended_at;
  const start = new Date(seg.started_at).getTime();
  const durationMs = Math.max(0, seg.duration_minutes || 0) * 60000;
  return new Date(start + durationMs).toISOString();
}

export function getGapMinutes(prevEnd: string, nextStart: string): number {
  return Math.max(0, (new Date(nextStart).getTime() - new Date(prevEnd).getTime()) / 60000);
}

export function sortSegmentsAsc(segments: TimelineSegment[]): TimelineSegment[] {
  return [...segments].sort(
    (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
  );
}

export function sortSegmentsDesc(segments: TimelineSegment[]): TimelineSegment[] {
  return [...segments].sort(
    (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
  );
}

export function cleanBrowserTitle(rawTitle: string, appName?: string): string {
  let title = rawTitle.trim();
  if (!title) return "";

  const suffixes = [
    "Google Chrome",
    "Safari",
    "Firefox",
    "Arc",
    "Microsoft Edge",
    "Brave Browser",
    "Brave",
    "Vivaldi",
    "Opera",
  ];

  for (const suffix of suffixes) {
    title = title.replace(new RegExp(`\\s*-\\s*${suffix}(?:\\s*-\\s*[^-]+)?$`, "i"), "");
  }

  if (appName) {
    const escaped = appName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    title = title.replace(new RegExp(`\\s*-\\s*${escaped}(?:\\s*-\\s*[^-]+)?$`, "i"), "");
  }

  title = title.replace(/\s*-\s*(?:chore-)?Isabelle$/i, "");
  title = title.replace(/\s*-\s*[^-]+$/, (match) => {
    const value = match.replace(/^\s*-\s*/, "");
    return /^(?:chore-)?isabelle$/i.test(value) ? "" : match;
  });

  return title.trim();
}
