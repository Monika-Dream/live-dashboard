import { useState, useEffect } from "react";
import type { ActivityRecord } from "@/lib/api";

interface MusicRecord {
  title: string;
  artist?: string;
  app?: string;
  album?: string;
  timestamp: string;
  device_name: string;
}

interface Props {
  activities: ActivityRecord[];
}

// Helper to extract music from activity notes/descriptions
// This will be populated from backend if available
function extractMusicInfo(activity: ActivityRecord): MusicRecord | null {
  // Placeholder - would need backend enhancement to store music metadata
  // For now, we'll show this as a feature that can be expanded
  return null;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function MusicPlaylist({ activities }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [musicRecords, setMusicRecords] = useState<MusicRecord[]>([]);

  // Extract music records from activities (music app tracking)
  useEffect(() => {
    const musicApps = new Set([
      "Spotify",
      "Apple Music",
      "QQ Music",
      "NetEase Music",
      "foobar2000",
      "Winamp",
      "iTunes",
      "Music",
      "Vinyls",
      "Pacemaker",
    ]);

    const records: MusicRecord[] = [];
    const seen = new Set<string>();

    for (const activity of activities) {
      if (musicApps.has(activity.app_name) && activity.display_title) {
        const key = `${activity.app_name}:${activity.display_title}`;
        if (!seen.has(key)) {
          seen.add(key);
          records.push({
            title: activity.display_title,
            app: activity.app_name,
            timestamp: activity.started_at,
            device_name: activity.device_name,
          });
        }
      }
    }

    setMusicRecords(records.reverse()); // Show newest first
  }, [activities]);

  if (musicRecords.length === 0) {
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
            <p className="text-xs text-[var(--color-text-muted)] mb-1">♪ 播放历史</p>
            <p className="text-sm text-[var(--color-primary)] font-semibold">
              共 {musicRecords.length} 首歌曲
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
              <h2 className="text-lg font-bold">♪ 歌曲播放历史</h2>
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
                  {musicRecords.map((record, idx) => {
                    const isLast = idx === musicRecords.length - 1;

                    return (
                      <div key={`${record.app}-${idx}`} className="flex gap-4 pb-6 relative">
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
                              {formatTime(record.timestamp)}
                            </p>
                            <p className="text-sm font-semibold text-[var(--color-primary)] leading-snug break-words">
                              {record.title}
                            </p>
                            <div className="flex items-center gap-2 mt-2 text-xs text-[var(--color-text-muted)]">
                              {record.app && <span>🎵 {record.app}</span>}
                              {record.device_name && <span>📱 {record.device_name}</span>}
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
                总计 {musicRecords.length} 条播放记录
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
