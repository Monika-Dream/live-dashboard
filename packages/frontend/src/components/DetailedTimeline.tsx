import type { TimelineSegment } from "@/lib/api";
import { getAppDescription } from "@/lib/app-descriptions";

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

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(minutes: number): string {
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

interface MergedSegment {
  appName: string;
  displayTitle: string;
  startTime: string;
  durationMinutes: number;
  segments: TimelineSegment[];
  isCurrent: boolean;
}

interface Props {
  segments: TimelineSegment[];
  currentAppByDevice: Record<string, string>;
}

// Merge consecutive same-app segments and short switches
function mergeSegments(
  segments: TimelineSegment[],
  minDurationMinutes: number = 2,
  maxShortSwitchMinutes: number = 0.5
): MergedSegment[] {
  if (segments.length === 0) return [];

  const merged: MergedSegment[] = [];
  let current: MergedSegment | null = null;

  for (const seg of segments) {
    const duration = seg.duration_minutes || 0;

    // Check if we should merge with previous segment
    if (current && current.appName === seg.app_name) {
      // Same app - merge them
      current.durationMinutes += duration;
      current.segments.push(seg);
      // Update display title if newer segment has it
      if (seg.display_title && !current.displayTitle) {
        current.displayTitle = seg.display_title;
      }
    } else {
      // Different app
      if (
        current &&
        current.durationMinutes < minDurationMinutes &&
        merged.length > 0
      ) {
        // Current segment is short (< 2min), merge into previous
        const prev = merged[merged.length - 1];
        if (prev) {
          prev.durationMinutes += current.durationMinutes;
          prev.segments.push(...current.segments);
        }
      } else if (current) {
        // Save current segment
        merged.push(current);
      }

      // Start new segment
      current = {
        appName: seg.app_name,
        displayTitle: seg.display_title || "",
        startTime: seg.started_at,
        durationMinutes: duration,
        segments: [seg],
        isCurrent: false,
      };
    }
  }

  // Handle last segment
  if (current) {
    if (
      current.durationMinutes < minDurationMinutes &&
      merged.length > 0
    ) {
      const prev = merged[merged.length - 1];
      if (prev) {
        prev.durationMinutes += current.durationMinutes;
        prev.segments.push(...current.segments);
      }
    } else {
      merged.push(current);
    }
  }

  return merged;
}

export default function DetailedTimeline({
  segments,
  currentAppByDevice,
}: Props) {
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
    <div className="space-y-8">
      {Array.from(byDevice.entries()).map(([deviceId, { name, segs }]) => {
        const merged = mergeSegments(segs, 2, 0.5);
        const currentApp = currentAppByDevice[deviceId];

        // Mark current segments
        for (const m of merged) {
          if (m.appName === currentApp) {
            m.isCurrent = true;
          }
        }

        return (
          <div key={deviceId}>
            <h3 className="text-xs font-semibold mb-4 text-[var(--color-text-muted)] uppercase tracking-wider">
              📱 {name}
            </h3>

            {/* Timeline view */}
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gradient-to-b from-[var(--color-primary)] to-[var(--color-primary-light)]" />

              {/* Segments */}
              <div className="space-y-4">
                {merged.map((seg, idx) => {
                  const color = getAppColor(seg.appName, colorMap);
                  const isLast = idx === merged.length - 1;

                  return (
                    <div key={`${seg.appName}-${idx}`} className="flex gap-4">
                      {/* Dot */}
                      <div className="flex-shrink-0 pt-2">
                        <div
                          className={`w-4 h-4 rounded-full border-2 border-[var(--color-cream)] shadow-md ${
                            seg.isCurrent ? "ring-2 ring-[var(--color-primary)] ring-offset-1" : ""
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      </div>

                      {/* Content */}
                      <div className="flex-1 pb-4">
                        <div className="bg-[var(--color-cream-light)] rounded-lg p-4 border-l-4" style={{ borderColor: color }}>
                          {/* Time and duration */}
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-[var(--color-text-muted)]">
                              🕐 {formatTime(seg.startTime)}
                            </span>
                            <span className="text-xs font-mono bg-[var(--color-primary)]/10 px-2 py-1 rounded text-[var(--color-primary)]">
                              {formatDuration(seg.durationMinutes)}
                            </span>
                          </div>

                          {/* App name and description */}
                          <p className="text-sm font-semibold text-[var(--color-primary)] leading-snug break-words">
                            {getAppDescription(seg.appName, seg.displayTitle)}
                          </p>

                          {/* Merged segments indicator */}
                          {seg.segments.length > 1 && (
                            <p className="text-xs text-[var(--color-text-muted)] mt-2">
                              📊 {seg.segments.length} 个时段合并
                            </p>
                          )}

                          {/* Current badge */}
                          {seg.isCurrent && (
                            <div className="mt-2 inline-block">
                              <span className="text-xs font-bold bg-[var(--color-primary)] text-white px-2 py-1 rounded">
                                ▸ 当前
                              </span>
                            </div>
                          )}
                        </div>
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
