"use client";

import { useEffect, useMemo } from "react";
import { useDashboard } from "@/hooks/useDashboard";
import Header from "@/components/Header";
import CurrentStatus from "@/components/CurrentStatus";
import DeviceCard from "@/components/DeviceCard";
import DatePicker from "@/components/DatePicker";
import Timeline from "@/components/Timeline";

export default function Home() {
  const { current, timeline, selectedDate, changeDate, loading, error, viewerCount } = useDashboard();

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

  // Night mode when all devices offline
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

      {/* Error */}
      {error && (
        <div className="vn-bubble mb-5 border-[var(--color-accent)] animate-fade-up">
          <p className="text-sm text-[var(--color-accent)] font-bold">
            (&gt;_&lt;) 连接失败了...
          </p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            别担心，会自动重试的~
          </p>
        </div>
      )}

      {/* Loading */}
      {loading && !current && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 animate-fade-up">
          <p className="text-3xl leading-none">(=^-ω-^=)</p>
          <div className="loading-dots">
            <span />
            <span />
            <span />
          </div>
          <p className="text-xs text-[var(--color-text-muted)] font-[var(--font-jp)]">
            正在加载喵~
          </p>
        </div>
      )}

      {current && (
        <>
          <CurrentStatus devices={current.devices ?? []} />

          <div className="flex flex-col lg:flex-row gap-8">
            {/* Devices */}
            <div className="lg:w-56 flex-shrink-0 space-y-2 animate-fade-up" style={{ animationDelay: "0.15s" }}>
              <h2 className="text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-2.5">
                Devices
              </h2>
              {(!current.devices || current.devices.length === 0) ? (
                <div className="text-center py-6">
                  <p className="text-xl mb-1 leading-none">( -ω-) zzZ</p>
                  <p className="text-xs text-[var(--color-text-muted)] font-[var(--font-jp)]">
                    还没有设备连接呢~
                  </p>
                </div>
              ) : (
                current.devices.map((d) => (
                  <DeviceCard key={d.device_id} device={d} />
                ))
              )}
            </div>

            {/* Timeline */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-5 flex-wrap gap-2 animate-fade-up" style={{ animationDelay: "0.2s" }}>
                <DatePicker selectedDate={selectedDate} onChange={changeDate} />
              </div>

              <div className="separator-dashed mb-5" />

              {loading && timeline ? (
                <div className="opacity-50 transition-opacity">
                  <Timeline
                    segments={timeline.segments}
                    summary={timeline.summary}
                    currentAppByDevice={currentAppByDevice}
                  />
                </div>
              ) : timeline ? (
                <Timeline
                  segments={timeline.segments}
                  summary={timeline.summary}
                  currentAppByDevice={currentAppByDevice}
                />
              ) : null}
            </div>
          </div>
        </>
      )}

      {/* Footer */}
      <footer className="mt-16 pt-5 separator-dashed text-center animate-fade-up" style={{ animationDelay: "0.3s" }}>
        <p className="text-[10px] text-[var(--color-text-muted)] font-[var(--font-jp)]">
          Monika Now &middot; 10s refresh &middot; (◕ᴗ◕)
        </p>
      </footer>
    </>
  );
}
