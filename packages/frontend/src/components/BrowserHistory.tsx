"use client";

import { useMemo, useState } from "react";
import type { TimelineSegment } from "@/lib/api";
import {
  cleanBrowserTitle,
  formatClockTime,
  formatDuration,
  isBrowserApp,
  sortSegmentsAsc,
} from "@/lib/timeline-utils";

interface Props {
  segments: TimelineSegment[];
}

interface BrowserVisitGroup {
  title: string;
  appName: string;
  startTime: string;
  endTime: string;
  totalMinutes: number;
  count: number;
  items: TimelineSegment[];
}

interface BrowserOverviewItem {
  title: string;
  count: number;
  totalMinutes: number;
}

function groupBrowserVisits(segments: TimelineSegment[]): BrowserVisitGroup[] {
  const browserSegments = sortSegmentsAsc(segments)
    .filter((seg) => isBrowserApp(seg.app_name) && (seg.display_title || "").trim())
    .map((seg) => ({
      ...seg,
      display_title: cleanBrowserTitle(seg.display_title || "", seg.app_name),
    }))
    .filter((seg) => (seg.display_title || "").trim());
  const groups: BrowserVisitGroup[] = [];

  for (const seg of browserSegments) {
    const title = (seg.display_title || "").trim();
    const duration = seg.duration_minutes || 0;
    const prev = groups[groups.length - 1];
    const canMerge =
      prev &&
      prev.title === title;

    if (canMerge) {
      prev.endTime = seg.ended_at || seg.started_at;
      prev.totalMinutes += duration;
      prev.count += 1;
      prev.items.push(seg);
      continue;
    }

    groups.push({
      title,
      appName: seg.app_name,
      startTime: seg.started_at,
      endTime: seg.ended_at || seg.started_at,
      totalMinutes: duration,
      count: 1,
      items: [seg],
    });
  }

  return groups.reverse();
}

function buildBrowserOverview(groups: BrowserVisitGroup[]): BrowserOverviewItem[] {
  const stats = new Map<string, BrowserOverviewItem>();
  for (const group of groups) {
    const current = stats.get(group.title);
    if (current) {
      current.count += group.count;
      current.totalMinutes += group.totalMinutes;
      continue;
    }
    stats.set(group.title, {
      title: group.title,
      count: group.count,
      totalMinutes: group.totalMinutes,
    });
  }

  return Array.from(stats.values())
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return b.totalMinutes - a.totalMinutes;
    })
    .slice(0, 3);
}

export default function BrowserHistory({ segments }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const groups = useMemo(() => groupBrowserVisits(segments), [segments]);
  const overview = useMemo(() => buildBrowserOverview(groups), [groups]);

  if (groups.length === 0) {
    return null;
  }

  return (
    <>
      <button
        onClick={() => setIsExpanded(true)}
        className="vn-bubble mb-4 w-full text-left hover:bg-[var(--color-cream-light)] transition"
      >
        <div className="px-5 py-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-[var(--color-text-muted)] mb-1">🌐 浏览器历史</p>
            <p className="text-sm text-[var(--color-primary)] font-semibold">
              {groups.length} 个阅读条目
            </p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1 truncate">
              {groups
                .slice(0, 3)
                .map((group) => `${group.title}${group.count > 1 ? ` ×${group.count}` : ""}`)
                .join(" · ")}
            </p>
          </div>
          <span className="text-lg">↗</span>
        </div>
      </button>

      {isExpanded && (
        <div
          className="fixed inset-0 bg-black/45 z-40 flex items-center justify-center p-4"
          onClick={() => setIsExpanded(false)}
        >
          <div
            className="bg-[var(--color-cream)] rounded-2xl shadow-2xl max-w-3xl w-full max-h-[78vh] overflow-hidden border border-[var(--color-border)] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-[var(--color-primary)]">浏览历史</h2>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  连续多条相同网页标题会合并为一条，点开可看每次具体记录
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
              <div className="rounded-2xl bg-[var(--color-cream-light)] px-4 py-4">
                <p className="text-sm font-semibold text-[var(--color-primary)]">
                  今日阅读概览
                </p>
                <div className="flex flex-wrap gap-3 mt-3 text-xs text-[var(--color-text-muted)]">
                  <span>{groups.length} 个合并条目</span>
                  <span>前三相关网页</span>
                </div>
                <div className="mt-3 space-y-2">
                  {overview.map((item, index) => (
                    <div
                      key={`${item.title}-${index}`}
                      className="rounded-xl bg-[var(--color-card)] px-3 py-2 flex items-center justify-between gap-3"
                    >
                      <span className="text-sm text-[var(--color-primary)] truncate">
                        {index + 1}. {item.title}
                      </span>
                      <span className="text-xs text-[var(--color-text-muted)] flex-shrink-0">
                        {item.count} 条 · {formatDuration(item.totalMinutes)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {groups.map((group, index) => {
                const key = `${group.title}-${group.startTime}-${index}`;
                const isOpen = openKey === key;

                return (
                  <div key={key} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden">
                    <button
                      onClick={() => setOpenKey(isOpen ? null : key)}
                      className="w-full text-left px-4 py-4 hover:bg-[var(--color-cream-light)] transition"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[var(--color-primary)] break-words">
                            {group.title}
                          </p>
                          <p className="text-xs text-[var(--color-text-muted)] mt-2">
                            {formatClockTime(group.startTime, true)} - {formatClockTime(group.endTime, true)}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs text-[var(--color-text-muted)]">
                            {group.count > 1 ? `合并 ${group.count} 条` : group.appName}
                          </p>
                          <p className="text-xs font-mono text-[var(--color-primary)] mt-1">
                            {formatDuration(group.totalMinutes)}
                          </p>
                        </div>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="px-4 pb-4 space-y-2">
                        {group.items.map((item, itemIndex) => (
                          <div
                            key={`${item.started_at}-${itemIndex}`}
                            className="rounded-xl bg-[var(--color-cream-light)] px-3 py-2 flex items-center justify-between gap-3 text-xs"
                          >
                            <span className="text-[var(--color-text-muted)]">
                              {formatClockTime(item.started_at, true)}
                              {item.ended_at ? ` - ${formatClockTime(item.ended_at, true)}` : ""}
                            </span>
                            <span className="text-[var(--color-primary)] font-mono">
                              {formatDuration(item.duration_minutes || 0)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
