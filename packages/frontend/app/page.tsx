"use client";

import { useEffect, useMemo } from "react";
import { useDashboard } from "@/hooks/useDashboard";
import Header from "@/components/Header";
import CurrentStatus from "@/components/CurrentStatus";
import MusicStatus from "@/components/MusicStatus";
import BrowserHistory from "@/components/BrowserHistory";
import MusicPlaylist from "@/components/MusicPlaylist";
import DetailedTimeline from "@/components/DetailedTimeline";
import DeviceCard from "@/components/DeviceCard";
import DatePicker from "@/components/DatePicker";

export default function Home() {
  const { current, timeline, selectedDate, changeDate, loading, error, viewerCount } = useDashboard();

  // Build currentAppByDevice map for Timeline
  const currentAppByDevice = useMemo(() => {
    const map: Record<string, string> = {};
    if (current?.devices) {
      for (const d of current.devices) {
        if (d.is_online === 1 && d.app_name) {
          map[d.device_id] = d.app_name;
        }
      }
    }
    return map;
  }, [current?.devices]);

  // Night mode: activate when all devices are offline (Isabelle sleeping)
  const allOffline = useMemo(() => {
    if (!current?.devices || current.devices.length === 0) return false;
    return current.devices.every((d) => d.is_online !== 1);
  }, [current?.devices]);

  useEffect(() => {
    document.body.classList.toggle("night-mode", allOffline);
    return () => { document.body.classList.remove("night-mode"); };
  }, [allOffline]);

  return (
    <>
      <Header serverTime={current?.server_time} viewerCount={viewerCount} />

      {/* Error banner */}
      {error && (
        <div className="vn-bubble mb-4 border-[var(--color-primary)]">
          <p className="text-sm text-[var(--color-primary)]">
            (&gt;_&lt;) 连接失败了喵...
          </p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            别担心，会自动重试的~
          </p>
        </div>
      )}

      {/* Loading state */}
      {loading && !current && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <p className="text-2xl">(=^-ω-^=)</p>
          <div className="loading-dots">
            <span />
            <span />
            <span />
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">正在加载喵~</p>
        </div>
      )}

      {current && (
        <>
          {/* Current status - prominent VN dialog */}
          <CurrentStatus devices={current.devices ?? []} />
          <MusicStatus devices={current.devices ?? []} />

          <div className="flex flex-col lg:flex-row gap-6">
            {/* Left: device cards (narrow) */}
            <div className="lg:w-56 flex-shrink-0 space-y-2">
              <h2 className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
                Devices
              </h2>
              {(!current.devices || current.devices.length === 0) ? (
                <div className="text-center py-4">
                  <p className="text-lg mb-1">( -ω-) zzZ</p>
                  <p className="text-xs text-[var(--color-text-muted)] italic">
                    还没有设备连接呢~
                  </p>
                </div>
              ) : (
                current.devices.map((d) => (
                  <DeviceCard key={d.device_id} device={d} />
                ))
              )}
            </div>

            {/* Right: timeline (wide) */}
            <div className="flex-1 min-w-0">
              {/* Date picker */}
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <DatePicker selectedDate={selectedDate} onChange={changeDate} />
              </div>

              <div className="separator-dashed mb-4" />

              {/* Browser history panel */}
              {timeline && <BrowserHistory segments={timeline.segments} />}

              {/* Music playlist panel */}
              {timeline && <MusicPlaylist activities={timeline.segments.map((seg) => ({
                id: Math.random(),
                device_id: seg.device_id,
                device_name: seg.device_name,
                platform: "",
                app_id: seg.app_id,
                app_name: seg.app_name,
                display_title: seg.display_title,
                started_at: seg.started_at,
              }))} />}

              {/* Timeline content */}
              {loading && timeline ? (
                <div className="opacity-60">
                  <DetailedTimeline
                    segments={timeline.segments}
                    currentAppByDevice={currentAppByDevice}
                  />
                </div>
              ) : timeline ? (
                <DetailedTimeline
                  segments={timeline.segments}
                  currentAppByDevice={currentAppByDevice}
                />
              ) : null}
            </div>
          </div>
        </>
      )}

      {/* Footer */}
      <footer className="mt-12 pt-4 separator-dashed text-center">
        <p className="text-[10px] text-[var(--color-text-muted)]">
          Isabelle Now &middot; 每 10 秒自动刷新 &middot; (◕ᴗ◕)
        </p>
      </footer>
    </>
  );
}
