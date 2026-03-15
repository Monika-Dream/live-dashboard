import type { TimelineSegment } from "@/lib/api";
import { getAppDescription } from "@/lib/app-descriptions";

// Palette that works with both day and night mode
const APP_COLORS = [
  "#c084fc", "#67d6aa", "#fca5a5", "#fdb88a", "#93c5fd",
  "#a78bfa", "#6ee7b7", "#fda4af", "#fdba74", "#7dd3fc",
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
      <div className="text-center py-16 text-[var(--color-text-muted)]">
        <p className="text-3xl mb-2 leading-none">(=^-ω-^=)</p>
        <p className="text-sm font-[var(--font-jp)]">今天还没有活动记录呢~</p>
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
    <div className="space-y-8">
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
          <div key={deviceId} className="animate-fade-up" style={{ animationDelay: "0.2s" }}>
            <h3 className="text-[11px] font-bold mb-3 text-[var(--color-text-muted)] uppercase tracking-widest">
              {name}
            </h3>

            <div className="max-h-[420px] overflow-y-auto pr-1 timeline-scroll">
              <div className="space-y-1.5">
                {sorted.map((app) => {
                  const color = getAppColor(app.appName, colorMap);
                  return (
                    <div
                      key={app.appName}
                      className={`timeline-bar flex items-center ${app.isCurrent ? "timeline-active" : ""}`}
                    >
                      {/* Left: indicator */}
                      <div className="flex-shrink-0 w-14 px-2 py-2.5 flex items-center justify-center">
                        {app.isCurrent ? (
                          <span className="text-[10px] font-bold text-[var(--color-primary)] current-badge">
                            ▸ now
                          </span>
                        ) : (
                          <span
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: color, boxShadow: `0 0 4px ${color}40` }}
                          />
                        )}
                      </div>

                      {/* Center: description */}
                      <div
                        className="flex-1 px-3 py-2.5 min-w-0"
                        style={{ backgroundColor: app.isCurrent ? `${color}25` : `${color}10` }}
                      >
                        <span className="text-xs font-medium truncate block font-[var(--font-jp)]">
                          {getAppDescription(app.appName, app.displayTitle)}
                        </span>
                      </div>

                      {/* Right: duration */}
                      <div className="flex-shrink-0 w-16 px-2 py-2.5 text-right">
                        <span className="text-[10px] font-bold text-[var(--color-peach)]">
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
