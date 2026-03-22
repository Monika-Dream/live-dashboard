"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import type { HealthRecord, HealthDataResponse } from "@/lib/api";
import { fetchHealthData } from "@/lib/api";

// Type metadata for display
const TYPE_META: Record<string, { label: string; icon: string; priority: number }> = {
  heart_rate:             { label: "心率",     icon: "💓",  priority: 1 },
  oxygen_saturation:      { label: "血氧",     icon: "🩸", priority: 2 },
  steps:                  { label: "步数",     icon: "🚶", priority: 3 },
  active_calories:        { label: "活动卡路里", icon: "🔥", priority: 4 },
  sleep:                  { label: "睡眠",     icon: "😴", priority: 5 },
  weight:                 { label: "体重",     icon: "⚖",  priority: 6 },
  body_temperature:       { label: "体温",     icon: "🌡",  priority: 7 },
  blood_pressure:         { label: "血压",     icon: "🩺", priority: 8 },
  resting_heart_rate:     { label: "静息心率",  icon: "💚", priority: 9 },
  heart_rate_variability: { label: "心率变异性", icon: "💜", priority: 10 },
  distance:               { label: "距离",     icon: "📏", priority: 11 },
  exercise:               { label: "运动",     icon: "🏃", priority: 12 },
  respiratory_rate:       { label: "呼吸频率",  icon: "💨", priority: 13 },
  blood_glucose:          { label: "血糖",     icon: "🩸", priority: 14 },
  height:                 { label: "身高",     icon: "📐", priority: 15 },
  total_calories:         { label: "总卡路里",  icon: "🔥", priority: 16 },
  hydration:              { label: "饮水",     icon: "💧", priority: 17 },
  nutrition:              { label: "营养",     icon: "🍎", priority: 18 },
};

// Core metrics shown as cards at top
const CORE_TYPES = ["heart_rate", "oxygen_saturation", "steps", "active_calories"];

interface Props {
  selectedDate: string;
}

export default function HealthData({ selectedDate }: Props) {
  const [data, setData] = useState<HealthDataResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedDate) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchHealthData(selectedDate, controller.signal)
      .then((d) => {
        if (!controller.signal.aborted) setData(d);
      })
      .catch((e) => {
        if (!controller.signal.aborted && e?.name !== "AbortError") {
          setError(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [selectedDate]);

  // Group records by type, get latest value for each
  const grouped = useMemo(() => {
    if (!data?.records?.length) return new Map<string, { latest: HealthRecord; all: HealthRecord[] }>();
    const map = new Map<string, { latest: HealthRecord; all: HealthRecord[] }>();
    for (const r of data.records) {
      const existing = map.get(r.type);
      if (existing) {
        existing.all.push(r);
        if (r.recorded_at > existing.latest.recorded_at) {
          existing.latest = r;
        }
      } else {
        map.set(r.type, { latest: r, all: [r] });
      }
    }
    return map;
  }, [data]);

  // Heart rate timeline for chart
  const heartRatePoints = useMemo(() => {
    const hrData = grouped.get("heart_rate");
    if (!hrData || hrData.all.length < 2) return [];
    return hrData.all
      .map((r) => ({ time: new Date(r.recorded_at), value: r.value }))
      .sort((a, b) => a.time.getTime() - b.time.getTime());
  }, [grouped]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-xs text-[var(--color-text-muted)]">加载健康数据中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-xs text-[var(--color-text-muted)]">健康数据加载失败</p>
      </div>
    );
  }

  if (!data || data.records.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-lg mb-1">(´-ω-`)</p>
        <p className="text-xs text-[var(--color-text-muted)]">今天还没有健康数据呢~</p>
      </div>
    );
  }

  // Sorted types by priority
  const sortedTypes = Array.from(grouped.keys()).sort((a, b) => {
    const pa = TYPE_META[a]?.priority ?? 99;
    const pb = TYPE_META[b]?.priority ?? 99;
    return pa - pb;
  });

  const coreTypes = sortedTypes.filter((t) => CORE_TYPES.includes(t));
  const secondaryTypes = sortedTypes.filter((t) => !CORE_TYPES.includes(t));

  return (
    <div className="space-y-3">
      {/* Core metrics cards */}
      {coreTypes.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {coreTypes.map((type) => {
            const meta = TYPE_META[type];
            const entry = grouped.get(type)!;
            return (
              <div
                key={type}
                className="border border-dashed border-[var(--color-border)] rounded-md p-3"
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-sm">{meta?.icon}</span>
                  <span className="text-[10px] text-[var(--color-text-muted)]">
                    {meta?.label ?? type}
                  </span>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-mono font-semibold text-[var(--color-text)]">
                    {formatValue(entry.latest.value, type)}
                  </span>
                  <span className="text-[10px] text-[var(--color-text-muted)]">
                    {entry.latest.unit}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Heart rate trend chart */}
      {heartRatePoints.length >= 2 && (
        <div className="border border-dashed border-[var(--color-border)] rounded-md p-3">
          <p className="text-[10px] text-[var(--color-text-muted)] mb-2">今日心率趋势</p>
          <HeartRateChart points={heartRatePoints} />
        </div>
      )}

      {/* Secondary metrics */}
      {secondaryTypes.length > 0 && (
        <div className="border border-dashed border-[var(--color-border)] rounded-md p-2">
          <div className="space-y-1">
            {secondaryTypes.map((type) => {
              const meta = TYPE_META[type];
              const entry = grouped.get(type)!;
              return (
                <div key={type} className="flex items-center justify-between px-2 py-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs">{meta?.icon}</span>
                    <span className="text-xs text-[var(--color-text-muted)]">
                      {meta?.label ?? type}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xs font-mono font-medium text-[var(--color-text)]">
                      {formatValue(entry.latest.value, type)}
                    </span>
                    <span className="text-[10px] text-[var(--color-text-muted)]">
                      {entry.latest.unit}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function formatValue(value: number, type: string): string {
  if (type === "sleep" || type === "exercise") {
    const h = Math.floor(value / 60);
    const m = Math.round(value % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
  if (type === "steps") return value.toLocaleString();
  if (type === "distance") return (value / 1000).toFixed(1) + "km";
  if (type === "hydration") return Math.round(value).toString();
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(1);
}

// Pure SVG heart rate chart — responsive full-width, with hover tooltip
function HeartRateChart({ points }: { points: { time: Date; value: number }[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const width = 600;
  const height = 120;
  const padX = 36;
  const padY = 8;

  // Memoize all derived data to avoid recalc on hover re-renders
  const { pointCoords, pathD, labelTimes, minVal, maxVal } = useMemo(() => {
    if (points.length < 2) return { pointCoords: [], pathD: "", labelTimes: [], minVal: 0, maxVal: 0 };

    const vals = points.map((p) => p.value);
    const mn = Math.min(...vals) - 5;
    const mx = Math.max(...vals) + 5;
    const minTime = points[0]!.time.getTime();
    const maxTime = points[points.length - 1]!.time.getTime();
    const tSpan = maxTime - minTime || 1;
    const vSpan = mx - mn || 1;

    const toX = (t: number) => padX + ((t - minTime) / tSpan) * (width - padX * 2);
    const toY = (v: number) => padY + (1 - (v - mn) / vSpan) * (height - padY * 2);

    const coords = points.map((p) => ({
      x: toX(p.time.getTime()),
      y: toY(p.value),
    }));

    const d = coords.map((c, i) => {
      const x = c.x.toFixed(1);
      const y = c.y.toFixed(1);
      return i === 0 ? `M${x},${y}` : `L${x},${y}`;
    }).join("");

    const labels = [0, 0.25, 0.5, 0.75, 1].map((f) => {
      const t = new Date(minTime + f * tSpan);
      return { x: toX(t.getTime()), label: `${t.getHours().toString().padStart(2, "0")}:${t.getMinutes().toString().padStart(2, "0")}` };
    });

    return { pointCoords: coords, pathD: d, labelTimes: labels, minVal: mn, maxVal: mx };
  }, [points]);

  // Binary search for nearest point by X coordinate (points are time-sorted → X-sorted)
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg || pointCoords.length === 0) return;
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0) return;
      const svgX = ((e.clientX - rect.left) / rect.width) * width;

      let lo = 0;
      let hi = pointCoords.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (pointCoords[mid]!.x < svgX) lo = mid + 1;
        else hi = mid;
      }
      // Check lo and lo-1 to find actual nearest
      let nearest = lo;
      if (lo > 0 && Math.abs(pointCoords[lo - 1]!.x - svgX) < Math.abs(pointCoords[lo]!.x - svgX)) {
        nearest = lo - 1;
      }
      setHoverIdx(nearest);
    },
    [pointCoords]
  );

  const handleMouseLeave = useCallback(() => setHoverIdx(null), []);

  if (points.length < 2) return null;

  const hovered = hoverIdx !== null ? points[hoverIdx] : null;
  const hoveredCoord = hoverIdx !== null ? pointCoords[hoverIdx] : null;

  // Tooltip text
  const tooltipText = hovered
    ? `${hovered.time.getHours().toString().padStart(2, "0")}:${hovered.time.getMinutes().toString().padStart(2, "0")}  ${Math.round(hovered.value)} bpm`
    : "";

  // Keep tooltip inside SVG bounds
  const tooltipX = hoveredCoord ? Math.min(Math.max(hoveredCoord.x, padX + 40), width - padX - 40) : 0;
  const tooltipY = hoveredCoord ? Math.max(hoveredCoord.y - 10, padY + 4) : 0;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height + 14}`}
      className="w-full"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Grid lines */}
      <line x1={padX} y1={padY} x2={padX} y2={height} stroke="var(--color-border)" strokeWidth="0.5" />
      <line x1={padX} y1={height} x2={width - padX} y2={height} stroke="var(--color-border)" strokeWidth="0.5" />

      {/* Data line */}
      <path
        d={pathD}
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Hover indicator */}
      {hoveredCoord && (
        <>
          {/* Vertical guide line */}
          <line
            x1={hoveredCoord.x}
            y1={padY}
            x2={hoveredCoord.x}
            y2={height}
            stroke="var(--color-primary)"
            strokeWidth="0.5"
            strokeDasharray="3,3"
            opacity="0.5"
          />
          {/* Dot on the line */}
          <circle
            cx={hoveredCoord.x}
            cy={hoveredCoord.y}
            r="3"
            fill="var(--color-primary)"
          />
          {/* Tooltip background */}
          <rect
            x={tooltipX - 46}
            y={tooltipY - 14}
            width="92"
            height="16"
            rx="4"
            fill="var(--color-card)"
            stroke="var(--color-border)"
            strokeWidth="0.5"
            opacity="0.95"
          />
          {/* Tooltip text */}
          <text
            x={tooltipX}
            y={tooltipY - 3}
            textAnchor="middle"
            fontSize="9"
            fill="var(--color-text)"
            fontFamily="JetBrains Mono, monospace"
          >
            {tooltipText}
          </text>
        </>
      )}

      {/* Time labels */}
      {labelTimes.map((lt, i) => (
        <text
          key={i}
          x={lt.x}
          y={height + 12}
          textAnchor="middle"
          fontSize="10"
          fill="var(--color-text-muted)"
          fontFamily="JetBrains Mono, monospace"
        >
          {lt.label}
        </text>
      ))}

      {/* Min/max labels */}
      <text x={padX - 3} y={padY + 6} textAnchor="end" fontSize="10" fill="var(--color-text-muted)" fontFamily="JetBrains Mono, monospace">
        {Math.round(maxVal)}
      </text>
      <text x={padX - 3} y={height} textAnchor="end" fontSize="10" fill="var(--color-text-muted)" fontFamily="JetBrains Mono, monospace">
        {Math.round(minVal)}
      </text>
    </svg>
  );
}
