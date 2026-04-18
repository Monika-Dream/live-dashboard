import type { TimelineSegment } from "@/lib/api";
import { getAppDescription } from "@/lib/app-descriptions";

// Warm color palette
const APP_COLORS = [
  "#E8A0BF", "#88C9C9", "#E8B86D", "#C4A882", "#D4917B",
  "#A8C686", "#D4A0A0", "#8CB8B0", "#C9B97A", "#B89EC4",
];

function getAppColor(appName: string, colorMap: Map<string, string>): string {
  const existing = colorMap.get(appName);
  if (existing) return existing;
  const color = APP_COLORS[colorMap.size % APP_COLORS.length]!;
  colorMap.set(appName, color);
  return color;
}

function formatDuration(minutes: number): string {
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

interface AggregatedApp {
  appName: string;
  displayTitle: string;
  totalMinutes: number;
  lastSeenAt: number; // timestamp ms
  isCurrent: boolean;
}

interface Props {
  segments: TimelineSegment[];
  summary: Record<string, Record<string, number>>;
  currentAppByDevice: Record<string, string>; // device_id -> current app_name
}

export default function Timeline({ segments, summary, currentAppByDevice }: Props) {
  const colorMap = new Map<string, string>();

  if (segments.length === 0) {
    return (
      <div className="text-center py-12 text-[var(--color-text-muted)]">
        <p className="text-2xl mb-2">(^-ω-^=)</p>
        <p className="text-sm">今天还没有活动记录呢~</p>
      </div>
    );
  }

  // Group by device
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
    <div className="space-y-6">
      {Array.from(byDevice.entries()).map(([deviceId, { name, segs }]) => {
        // Single-pass aggregation: collect last-seen time + display_title per app
        const appMap = new Map<string, AggregatedApp>();
        for (const seg of segs) {
          const existing = appMap.get(seg.app_name);
          const segTime = new Date(seg.started_at).getTime() || 0;
          if (existing) {
            if (segTime > existing.lastSeenAt) {
              existing.lastSeenAt = segTime;
              // Keep the most recent display_title
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

        // Fill totalMinutes from summary (already computed by backend)
        const deviceSummary = summary[deviceId];
        if (deviceSummary) {
          for (const [app, mins] of Object.entries(deviceSummary)) {
            const entry = appMap.get(app);
            if (entry) {
              entry.totalMinutes = mins;
            }
          }
        }

        // Mark current app
        const currentApp = currentAppByDevice[deviceId];
        if (currentApp) {
          const entry = appMap.get(currentApp);
          if (entry) entry.isCurrent = true;
        }

        // Sort: current first, then by lastSeenAt desc
        const sorted = Array.from(appMap.values()).sort((a, b) => {
          if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
          return b.lastSeenAt - a.lastSeenAt;
        });

        return (
          <div key={deviceId}>
            <h3 className="text-xs font-semibold mb-2 text-[var(--color-text-muted)] uppercase tracking-wider">
              {name}
            </h3>

            <div className="max-h-[400px] overflow-y-auto pr-1 timeline-scroll">
              <div className="space-y-1">
                {sorted.map((app) => {
                  const color = getAppColor(app.appName, colorMap);
                  return (
                    <div
                      key={app.appName}
                      className={`timeline-bar flex items-center ${app.isCurrent ? "timeline-active" : ""}`}
                    >
                      {/* Current indicator or color dot */}
                      <div className="flex-shrink-0 w-16 px-2 py-2 flex items-center justify-center gap-1">
                        {app.isCurrent ? (
                          <span className="text-[10px] font-bold text-[var(--color-primary)] current-badge">
                            ▸ 当前
                          </span>
                        ) : (
                          <span
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: color }}
                          />
                        )}
                      </div>

                      {/* App description */}
                      <div
                        className="flex-1 px-3 py-2 min-w-0"
                        style={{ backgroundColor: app.isCurrent ? `${color}30` : `${color}15` }}
                      >
                        <span className="text-xs font-medium truncate block">
                          {getAppDescription(app.appName, app.displayTitle)}
                        </span>
                      </div>

                      {/* Duration */}
                      <div className="flex-shrink-0 w-16 px-2 py-2 text-right">
                        <span className="text-[10px] font-mono text-[var(--color-accent)] font-medium">
                          {formatDuration(app.totalMinutes)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
