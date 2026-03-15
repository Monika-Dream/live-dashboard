import type { TimelineSegment } from "@/lib/api";
import { getAppDescription } from "@/lib/app-descriptions";

const DOT_COLORS = [
  "#e87a90", "#86a697", "#f5c63c", "#c4886d", "#7eb8c9",
  "#d4a373", "#a0937d", "#b5838d", "#8fbc8f", "#c9a96e",
];

function getDotColor(appName: string, colorMap: Map<string, string>): string {
  const existing = colorMap.get(appName);
  if (existing) return existing;
  const color = DOT_COLORS[colorMap.size % DOT_COLORS.length]!;
  colorMap.set(appName, color);
  return color;
}

function formatDuration(minutes: number): string {
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

interface AggregatedApp {
  appName: string;
  displayTitle: string;
  totalMinutes: number;
  lastSeenAt: number;
  isCurrent: boolean;
}

interface Props {
  segments: TimelineSegment[];
  summary: Record<string, Record<string, number>>;
  currentAppByDevice: Record<string, string>;
}

export default function Timeline({ segments, summary, currentAppByDevice }: Props) {
  const colorMap = new Map<string, string>();

  if (segments.length === 0) {
    return (
      <div className="tl-empty">
        <p className="text-2xl mb-2">(·_·)</p>
        <p className="text-sm">今天还没有记录</p>
      </div>
    );
  }

  const byDevice = new Map<string, { name: string; segs: TimelineSegment[] }>();
  for (const seg of segments) {
    let entry = byDevice.get(seg.device_id);
    if (!entry) {
      entry = { name: seg.device_name, segs: [] };
      byDevice.set(seg.device_id, entry);
    }
    entry.segs.push(seg);
  }

  return (
    <div className="space-y-6 animate-in" style={{ animationDelay: "0.15s" }}>
      {Array.from(byDevice.entries()).map(([deviceId, { name, segs }]) => {
        const appMap = new Map<string, AggregatedApp>();
        for (const seg of segs) {
          const existing = appMap.get(seg.app_name);
          const segTime = new Date(seg.started_at).getTime() || 0;
          if (existing) {
            if (segTime > existing.lastSeenAt) {
              existing.lastSeenAt = segTime;
              if (seg.display_title) existing.displayTitle = seg.display_title;
            }
          } else {
            appMap.set(seg.app_name, {
              appName: seg.app_name,
              displayTitle: seg.display_title || "",
              totalMinutes: 0,
              lastSeenAt: segTime,
              isCurrent: false,
            });
          }
        }

        const deviceSummary = summary[deviceId];
        if (deviceSummary) {
          for (const [app, mins] of Object.entries(deviceSummary)) {
            const entry = appMap.get(app);
            if (entry) entry.totalMinutes = mins;
          }
        }

        const currentApp = currentAppByDevice[deviceId];
        if (currentApp) {
          const entry = appMap.get(currentApp);
          if (entry) entry.isCurrent = true;
        }

        const sorted = Array.from(appMap.values()).sort((a, b) => {
          if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
          return b.lastSeenAt - a.lastSeenAt;
        });

        return (
          <div key={deviceId}>
            <p className="section-label mb-2">{name}</p>
            <div className="tl-scroll">
              {sorted.map((app) => {
                const color = getDotColor(app.appName, colorMap);
                return (
                  <div
                    key={app.appName}
                    className={`tl-item ${app.isCurrent ? "current" : ""}`}
                  >
                    <span
                      className={`tl-dot ${app.isCurrent ? "current" : ""}`}
                      style={app.isCurrent ? undefined : { backgroundColor: color }}
                    />
                    <span className="tl-desc">
                      {app.isCurrent && (
                        <span className="text-[var(--color-primary)] font-bold mr-1">▸</span>
                      )}
                      {getAppDescription(app.appName, app.displayTitle)}
                    </span>
                    <span className="tl-duration">
                      {formatDuration(app.totalMinutes)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
