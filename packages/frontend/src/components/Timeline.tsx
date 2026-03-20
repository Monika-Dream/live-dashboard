import type { TimelineSegment } from "@/lib/api";
import { getAppDescription } from "@/lib/app-descriptions";

const PALETTE = [
  "#ff6b9d", "#c084fc", "#67e8f9", "#fbbf24", "#6ee7b7",
  "#f97316", "#a78bfa", "#38bdf8", "#e879f9", "#4ade80",
];

function getColor(appName: string, colorMap: Map<string, string>): string {
  const existing = colorMap.get(appName);
  if (existing) return existing;
  const color = PALETTE[colorMap.size % PALETTE.length]!;
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
      <div className="text-center py-16">
        <p className="text-2xl opacity-40 mb-3">( ^-ω-^ )</p>
        <p className="text-sm text-[var(--color-text-muted)]">No activity recorded yet</p>
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
          const rawTime = new Date(seg.started_at).getTime();
          const segTime = Number.isFinite(rawTime) ? rawTime : 0;
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
            <h3 className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-[0.15em] mb-3">
              {name}
            </h3>

            <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
              {sorted.map((app) => {
                const color = getColor(app.appName, colorMap);

                return (
                  <div
                    key={app.appName}
                    className={`timeline-entry glass-sm flex items-center gap-3 px-4 py-2.5 group ${
                      app.isCurrent ? "timeline-active-glow" : ""
                    }`}
                  >
                    {/* Color accent bar */}
                    <div
                      className="w-1 self-stretch rounded-full flex-shrink-0 transition-opacity group-hover:opacity-100"
                      style={{ backgroundColor: color, opacity: app.isCurrent ? 1 : 0.5 }}
                    />

                    {/* Current badge or spacer */}
                    <div className="w-10 flex-shrink-0">
                      {app.isCurrent && (
                        <span className="text-[10px] font-semibold text-[var(--color-accent)] uppercase tracking-wider">
                          Now
                        </span>
                      )}
                    </div>

                    {/* Description */}
                    <div className="flex-1 min-w-0">
                      <span className="text-sm truncate block text-[var(--color-text)]">
                        {getAppDescription(app.appName, app.displayTitle)}
                      </span>
                    </div>

                    {/* Duration */}
                    <span className="text-[11px] font-mono text-[var(--color-text-muted)] tabular-nums flex-shrink-0">
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
