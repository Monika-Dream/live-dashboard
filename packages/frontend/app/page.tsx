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
        <div className="text-center py-4 animate-in">
          <p className="text-sm text-[var(--color-primary)]">
            连接失败了... 会自动重试
          </p>
        </div>
      )}

      {/* Loading */}
      {loading && !current && (
        <div className="flex flex-col items-center justify-center py-24 gap-4 animate-in">
          <p className="text-2xl">(·_·) ?</p>
          <div className="loading-bar" />
          <p className="text-xs text-[var(--color-text-dim)]">加载中</p>
        </div>
      )}

      {current && (
        <>
          {/* Status hero */}
          <CurrentStatus devices={current.devices ?? []} />

          {/* Devices */}
          <div className="py-4 animate-in" style={{ animationDelay: "0.1s" }}>
            <p className="section-label mb-1">Devices</p>
            {(!current.devices || current.devices.length === 0) ? (
              <p className="text-xs text-[var(--color-text-dim)] py-2">
                没有设备连接
              </p>
            ) : (
              current.devices.map((d) => (
                <DeviceCard key={d.device_id} device={d} />
              ))
            )}
          </div>

          <hr className="divider" />

          {/* Timeline */}
          <div className="py-4">
            <div className="flex items-center justify-between mb-3 animate-in" style={{ animationDelay: "0.12s" }}>
              <p className="section-label">Timeline</p>
              <DatePicker selectedDate={selectedDate} onChange={changeDate} />
            </div>

            {loading && timeline ? (
              <div className="opacity-40">
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
        </>
      )}

      {/* Footer */}
      <footer className="pt-6 pb-2 text-center">
        <p className="text-[0.6rem] text-[var(--color-text-dim)] font-[var(--font-mono)] tracking-wider">
          · · · 10s refresh · · ·
        </p>
      </footer>
    </>
  );
}
