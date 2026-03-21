import { useState } from "react";
import type { TimelineSegment } from "@/lib/api";

interface Props {
  segments: TimelineSegment[];
}

// Browser app names (expanded list)
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

function isBrowserApp(appName: string): boolean {
  return BROWSER_APPS.has(appName) || appName.toLowerCase().includes("chrome") || appName.toLowerCase().includes("safari");
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(minutes: number): string {
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function BrowserHistory({ segments }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Filter browser segments
  const browserSegments = segments.filter((seg) => isBrowserApp(seg.app_name));

  if (browserSegments.length === 0) {
    return null;
  }

  return (
    <>
      {/* Expandable button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="vn-bubble mb-4 w-full text-left hover:bg-[var(--color-cream-light)] transition"
      >
        <div className="px-5 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-[var(--color-text-muted)] mb-1">🌐 浏览器历史</p>
            <p className="text-sm text-[var(--color-primary)] font-semibold">
              共 {browserSegments.length} 条记录
            </p>
          </div>
          <span className={`text-lg transition-transform ${isExpanded ? "rotate-180" : ""}`}>
            ▼
          </span>
        </div>
      </button>

      {/* Modal overlay */}
      {isExpanded && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4" onClick={() => setIsExpanded(false)}>
          {/* Modal content */}
          <div
            className="bg-[var(--color-cream)] rounded-lg shadow-2xl max-w-2xl w-full max-h-[70vh] overflow-hidden flex flex-col border-2 border-[var(--color-primary)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-primary-light)] px-6 py-4 flex items-center justify-between text-white">
              <h2 className="text-lg font-bold">🌐 浏览器访问历史</h2>
              <button
                onClick={() => setIsExpanded(false)}
                className="text-2xl hover:opacity-70"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto flex-1">
              <div className="p-6 space-y-4">
                {/* Timeline - vertical line */}
                <div className="relative">
                  {browserSegments.map((seg, idx) => {
                    const duration = seg.duration_minutes || 0;
                    const isLast = idx === browserSegments.length - 1;

                    return (
                      <div key={`${seg.app_name}-${idx}`} className="flex gap-4 pb-6 relative">
                        {/* Timeline dot and line */}
                        <div className="flex flex-col items-center flex-shrink-0">
                          <div className="w-3 h-3 rounded-full bg-[var(--color-primary)] border-2 border-white shadow-md" />
                          {!isLast && (
                            <div className="w-0.5 h-16 bg-gradient-to-b from-[var(--color-primary)] to-[var(--color-primary-light)] mt-2" />
                          )}
                        </div>

                        {/* Content */}
                        <div className="pt-1 flex-1 min-w-0">
                          <div className="text-sm">
                            <p className="text-xs text-[var(--color-text-muted)] font-semibold mb-1">
                              {formatTime(seg.started_at)}
                            </p>
                            <p className="text-sm font-semibold text-[var(--color-primary)] leading-snug break-words">
                              {seg.display_title || `(${seg.app_name})`}
                            </p>
                            <div className="flex items-center gap-2 mt-2 text-xs text-[var(--color-text-muted)]">
                              <span>⏱️ {formatDuration(duration)}</span>
                              {seg.device_name && <span>📱 {seg.device_name}</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer stats */}
            <div className="bg-[var(--color-cream-light)] px-6 py-3 border-t border-[var(--color-text-muted)]/10 text-center">
              <p className="text-xs text-[var(--color-text-muted)]">
                总计 {browserSegments.length} 条浏览记录
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
