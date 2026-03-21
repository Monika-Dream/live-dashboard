"use client";

import { useMemo, useState } from "react";
import type { MusicHistoryRecord } from "@/lib/api";
import { formatClockTime } from "@/lib/timeline-utils";

interface Props {
  records: MusicHistoryRecord[];
}

interface PlaylistItem {
  title: string;
  artist?: string;
  album?: string;
  app: string;
  startedAt: string;
  deviceName: string;
}

function buildPlaylist(records: MusicHistoryRecord[]): PlaylistItem[] {
  const items: PlaylistItem[] = [];
  const indexMap = new Map<string, number>();

  for (const record of records) {
    const key = `${record.title}::${record.artist || ""}`;
    const existingIndex = indexMap.get(key);
    if (existingIndex != null) {
      continue;
    }

    indexMap.set(key, items.length);
    items.push({
      title: record.title,
      artist: record.artist || undefined,
      album: record.album || undefined,
      app: record.app_name,
      startedAt: record.started_at,
      deviceName: record.device_name,
    });
  }

  return items;
}

export default function MusicPlaylist({ records }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const playlist = useMemo(() => buildPlaylist(records), [records]);
  const preview = playlist.slice(0, 4);

  if (playlist.length === 0) {
    return null;
  }

  return (
    <>
      <div className="card-decorated rounded-xl p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <p className="text-[11px] text-[var(--color-text-muted)] uppercase tracking-wider">
              Today&apos;s Music
            </p>
            <h3 className="text-sm font-semibold text-[var(--color-primary)]">
              今日听过 {playlist.length} 首
            </h3>
          </div>
          <button
            onClick={() => setIsExpanded(true)}
            className="text-xs px-3 py-1.5 rounded-full bg-[var(--color-primary)]/12 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20 transition"
          >
            查看全部
          </button>
        </div>

        <div className="space-y-2">
          {preview.map((record) => (
            <div
              key={`${record.title}-${record.artist || ""}`}
              className="rounded-xl bg-[var(--color-cream-light)] px-3 py-3"
            >
              <p className="text-sm font-semibold text-[var(--color-primary)] truncate">
                {record.title}
              </p>
              <div className="flex items-center justify-between gap-3 mt-1 text-[11px] text-[var(--color-text-muted)]">
                <span className="truncate">
                  {record.artist || record.app}
                </span>
                <span className="flex-shrink-0">{formatClockTime(record.startedAt)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {isExpanded && (
        <div
          className="fixed inset-0 bg-black/45 z-40 flex items-center justify-center p-4"
          onClick={() => setIsExpanded(false)}
        >
          <div
            className="bg-[var(--color-cream)] rounded-2xl shadow-2xl max-w-2xl w-full max-h-[78vh] overflow-hidden border border-[var(--color-border)] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-[var(--color-primary)]">今日音乐合集</h2>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  按后台播放历史去重展示，保留最近一次播放时间
                </p>
              </div>
              <button
                onClick={() => setIsExpanded(false)}
                className="text-xl text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6 space-y-3">
              {playlist.map((record) => (
                <div
                  key={`${record.title}-${record.artist || ""}`}
                  className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--color-primary)] break-words">
                        {record.title}
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)] mt-1">
                        {record.artist || "未知歌手"}
                      </p>
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)] flex-shrink-0">
                      {formatClockTime(record.startedAt, true)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 mt-3 text-[11px] text-[var(--color-text-muted)]">
                    <span>{record.app}</span>
                    <span>{record.deviceName}</span>
                    {record.album && <span>{record.album}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
