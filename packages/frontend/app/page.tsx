"use client";

import { useEffect, useMemo, useState } from "react";
import { useDashboard } from "@/hooks/useDashboard";
import { useConfig, useConfigLoader, ConfigContext } from "@/hooks/useConfig";
import type { CurrentResponse, DashboardProfile, DeviceState } from "@/lib/api";
import { fetchCurrent, fetchHealthData } from "@/lib/api";
import Header from "@/components/Header";
import CurrentStatus from "@/components/CurrentStatus";
import DeviceCard from "@/components/DeviceCard";
import DatePicker from "@/components/DatePicker";
import Timeline from "@/components/Timeline";
import HealthData from "@/components/HealthData";
import SiteMetadataSync from "@/components/SiteMetadataSync";

interface DashboardOption extends DashboardProfile {
  isPrimary: boolean;
}

interface DashboardSnapshot extends DashboardOption {
  onlineDevices: number;
  totalDevices: number;
  viewerCount: number;
  activeLabel: string;
  statusText: string;
  reachable: boolean;
}

export default function Home() {
  const config = useConfigLoader();

  return (
    <ConfigContext.Provider value={config}>
      <SiteMetadataSync />
      <HomeInner />
    </ConfigContext.Provider>
  );
}

function HomeInner() {
  const config = useConfig();
  const { displayName } = config;
  const dashboards = useMemo<DashboardOption[]>(() => {
    return [
      {
        id: "local",
        name: displayName,
        url: "",
        description: `${displayName} 的主面板`,
        isPrimary: true,
      },
      ...config.dashboards.map((dashboard) => ({
        ...dashboard,
        isPrimary: false,
      })),
    ];
  }, [config.dashboards, displayName]);

  const [selectedDashboardId, setSelectedDashboardId] = useState("local");
  const [dashboardSnapshots, setDashboardSnapshots] = useState<Record<string, DashboardSnapshot>>({});
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [tab, setTab] = useState<"activity" | "health">("activity");
  const [hasHealthData, setHasHealthData] = useState(false);

  useEffect(() => {
    if (!dashboards.some((dashboard) => dashboard.id === selectedDashboardId)) {
      setSelectedDashboardId("local");
    }
  }, [dashboards, selectedDashboardId]);

  const activeDashboard = useMemo(() => {
    return dashboards.find((dashboard) => dashboard.id === selectedDashboardId) ?? dashboards[0];
  }, [dashboards, selectedDashboardId]);
  const activeDashboardId = activeDashboard?.isPrimary ? undefined : activeDashboard?.id;
  const { current, timeline, selectedDate, changeDate, loading, error, viewerCount } = useDashboard(activeDashboardId);

  useEffect(() => {
    setSelectedDeviceId(null);
    setTab("activity");
  }, [selectedDashboardId]);

  useEffect(() => {
    let disposed = false;

    const loadSnapshots = async () => {
      const entries = await Promise.all(
        dashboards.map(async (dashboard) => {
          try {
            const response = await fetchCurrent(
              undefined,
              dashboard.isPrimary ? undefined : { dashboardId: dashboard.id },
            );
            return [dashboard.id, buildDashboardSnapshot(dashboard, response)] as const;
          } catch {
            return [dashboard.id, buildDashboardSnapshot(dashboard, null)] as const;
          }
        }),
      );

      if (!disposed) {
        setDashboardSnapshots(Object.fromEntries(entries));
      }
    };

    loadSnapshots();
    const timer = window.setInterval(loadSnapshots, 10_000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [dashboards]);

  useEffect(() => {
    if (!hasHealthData && tab === "health") setTab("activity");
  }, [hasHealthData, tab]);

  const currentAppByDevice = useMemo(() => {
    const map: Record<string, string> = {};
    if (current?.devices) {
      for (const device of current.devices) {
        if (device.is_online === 1 && device.app_name) {
          map[device.device_id] = device.app_name;
        }
      }
    }
    return map;
  }, [current?.devices]);

  const allOffline = useMemo(() => {
    if (!current?.devices || current.devices.length === 0) return false;
    return current.devices.every((device) => device.is_online !== 1);
  }, [current?.devices]);

  const devices = useMemo(() => {
    const list = current?.devices ?? [];
    return [...list].sort((left, right) => left.device_id.localeCompare(right.device_id));
  }, [current?.devices]);

  const selectedDevice = useMemo(() => {
    if (devices.length === 0) return undefined;
    if (selectedDeviceId) {
      const found = devices.find((device) => device.device_id === selectedDeviceId);
      if (found) return found;
    }
    return devices.find((device) => device.is_online === 1) || devices[0];
  }, [devices, selectedDeviceId]);

  const selectedDeviceIdResolved = selectedDevice?.device_id;

  useEffect(() => {
    if (!selectedDate || !selectedDeviceIdResolved) {
      setHasHealthData(false);
      return;
    }

    const controller = new AbortController();
    setHasHealthData(false);

    fetchHealthData(
      selectedDate,
      controller.signal,
      selectedDeviceIdResolved,
      activeDashboardId ? { dashboardId: activeDashboardId } : undefined,
    )
      .then((result) => {
        if (!controller.signal.aborted) {
          setHasHealthData(result.records.length > 0);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setHasHealthData(false);
        }
      });

    return () => controller.abort();
  }, [activeDashboardId, selectedDate, selectedDeviceIdResolved]);

  const filteredTimeline = useMemo(() => {
    if (!timeline || !selectedDevice) return timeline;
    const deviceId = selectedDevice.device_id;
    const segments = timeline.segments ?? [];
    const summary = timeline.summary ?? {};
    return {
      ...timeline,
      segments: segments.filter((segment) => segment.device_id === deviceId),
      summary: deviceId in summary ? { [deviceId]: summary[deviceId] } : {},
    };
  }, [timeline, selectedDevice]);

  const resolvedSnapshots = useMemo(() => {
    return dashboards.map((dashboard) => {
      return dashboardSnapshots[dashboard.id] ?? buildDashboardSnapshot(dashboard, null);
    });
  }, [dashboardSnapshots, dashboards]);

  useEffect(() => {
    document.body.classList.toggle("night-mode", allOffline);
    return () => {
      document.body.classList.remove("night-mode");
    };
  }, [allOffline]);

  return (
    <>
      <Header
        serverTime={current?.server_time}
        viewerCount={viewerCount}
        displayName={activeDashboard?.name ?? displayName}
      />

      <DashboardSwitcher
        dashboards={resolvedSnapshots}
        selectedDashboardId={activeDashboard?.id ?? "local"}
        onSelect={setSelectedDashboardId}
      />

      {error && (
        <div className="vn-bubble mb-4 border-[var(--color-primary)]">
          <p className="text-sm text-[var(--color-primary)]">
            (&gt;_&lt;) {activeDashboard?.name ?? displayName} 的面板连接失败了喵...
          </p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            别担心，会自动重试的~
          </p>
        </div>
      )}

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

      <section className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {resolvedSnapshots.map((dashboard) => (
          <DashboardOverviewCard
            key={dashboard.id}
            dashboard={dashboard}
            selected={dashboard.id === activeDashboard?.id}
            onSelect={() => setSelectedDashboardId(dashboard.id)}
          />
        ))}
      </section>

      {current && (
        <>
          <CurrentStatus device={selectedDevice} displayName={activeDashboard?.name} />

          <div className="flex flex-col lg:flex-row gap-6">
            <div className="lg:w-56 flex-shrink-0 space-y-2">
              <h2 className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
                Devices
              </h2>
              {devices.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-lg mb-1">( -ω-) zzZ</p>
                  <p className="text-xs text-[var(--color-text-muted)] italic">
                    还没有设备连接呢~
                  </p>
                </div>
              ) : (
                devices.map((device) => (
                  <DeviceCard
                    key={device.device_id}
                    device={device}
                    selected={selectedDevice?.device_id === device.device_id}
                    onSelect={() => setSelectedDeviceId(device.device_id)}
                  />
                ))
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <DatePicker selectedDate={selectedDate} onChange={changeDate} />
                {hasHealthData && (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setTab("activity")}
                      className={`pill-btn text-xs px-3 py-1 ${
                        tab === "activity"
                          ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)]"
                          : ""
                      }`}
                    >
                      活动
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab("health")}
                      className={`pill-btn text-xs px-3 py-1 ${
                        tab === "health"
                          ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)]"
                          : ""
                      }`}
                    >
                      健康
                    </button>
                  </div>
                )}
              </div>

              <div className="separator-dashed mb-3" />

              {devices.length > 1 && <DeviceOverview devices={devices} />}

              {tab === "activity" ? (
                <>
                  {loading && filteredTimeline ? (
                    <div className="opacity-60">
                      <Timeline
                        segments={filteredTimeline.segments}
                        summary={filteredTimeline.summary}
                        currentAppByDevice={currentAppByDevice}
                      />
                    </div>
                  ) : filteredTimeline ? (
                    <Timeline
                      segments={filteredTimeline.segments}
                      summary={filteredTimeline.summary}
                      currentAppByDevice={currentAppByDevice}
                    />
                  ) : null}
                </>
              ) : (
                <HealthData
                  selectedDate={selectedDate}
                  deviceId={selectedDevice?.device_id}
                  dashboardId={activeDashboardId}
                />
              )}
            </div>
          </div>
        </>
      )}

      <footer className="mt-12 pt-4 separator-dashed text-center">
        <p className="text-[10px] text-[var(--color-text-muted)]">
          {displayName} Now &middot; 已接入 {resolvedSnapshots.length} 个面板 &middot; 每 10 秒自动刷新 &middot; (◕ᴗ◕)
        </p>
      </footer>
    </>
  );
}

function buildDashboardSnapshot(
  dashboard: DashboardOption,
  current: CurrentResponse | null,
): DashboardSnapshot {
  if (!current) {
    return {
      ...dashboard,
      onlineDevices: 0,
      totalDevices: 0,
      viewerCount: 0,
      activeLabel: "暂时无法访问",
      statusText: "连接失败",
      reachable: false,
    };
  }

  const onlineDevices = current.devices.filter((device) => device.is_online === 1);
  const activeDevice = onlineDevices[0] ?? current.devices[0];
  const activeLabel = activeDevice
    ? activeDevice.is_online === 1
      ? activeDevice.app_name === "idle"
        ? "暂时离开"
        : activeDevice.app_name || "在线"
      : "当前离线"
    : "暂无设备";

  return {
    ...dashboard,
    onlineDevices: onlineDevices.length,
    totalDevices: current.devices.length,
    viewerCount: current.viewer_count ?? 0,
    activeLabel,
    statusText: onlineDevices.length > 0 ? "在线" : current.devices.length > 0 ? "离线" : "暂无设备",
    reachable: true,
  };
}

function DashboardSwitcher({
  dashboards,
  selectedDashboardId,
  onSelect,
}: {
  dashboards: DashboardSnapshot[];
  selectedDashboardId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="mb-4">
      <div className="mb-2">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-[var(--color-text-muted)]">
          Panels
        </p>
        <p className="text-xs text-[var(--color-text-muted)] mt-1">
          点击切换完整时间线，下方卡片可以同时看所有人的在线状态。
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {dashboards.map((dashboard) => (
          <button
            key={dashboard.id}
            type="button"
            onClick={() => onSelect(dashboard.id)}
            className={`panel-chip ${dashboard.id === selectedDashboardId ? "panel-chip-active" : ""}`}
          >
            <span>{dashboard.name}</span>
            <span className="text-[10px] opacity-70">{dashboard.onlineDevices}/{dashboard.totalDevices}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function DashboardOverviewCard({
  dashboard,
  selected,
  onSelect,
}: {
  dashboard: DashboardSnapshot;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`dashboard-overview-card text-left ${selected ? "dashboard-overview-card-active" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--color-text)]">{dashboard.name}</p>
          <p className="text-[11px] text-[var(--color-text-muted)] mt-1 line-clamp-2">
            {dashboard.description ?? "Live Dashboard 聚合面板"}
          </p>
        </div>
        <span className={`status-pill ${dashboard.onlineDevices > 0 ? "status-pill-online" : "status-pill-offline"}`}>
          {dashboard.statusText}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">Devices</p>
          <p className="text-lg font-semibold text-[var(--color-text)]">{dashboard.onlineDevices}/{dashboard.totalDevices}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">Viewers</p>
          <p className="text-lg font-semibold text-[var(--color-text)]">{dashboard.viewerCount}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">Status</p>
          <p className="text-sm font-semibold text-[var(--color-text)] truncate">{dashboard.activeLabel}</p>
        </div>
      </div>
    </button>
  );
}

const platformIcons: Record<string, string> = {
  windows: "\u{1F5A5}",
  android: "\u{1F4F1}",
};

function DeviceOverview({ devices }: { devices: DeviceState[] }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[11px] text-[var(--color-text-muted)]">
      {devices.map((device) => {
        const isOnline = device.is_online === 1;
        const icon = platformIcons[device.platform] || "\u{1F4BB}";
        return (
          <span key={device.device_id} className={isOnline ? "" : "opacity-40"}>
            {icon} {device.device_name} · {isOnline ? (device.app_name === "idle" ? "暂时离开" : device.app_name || "idle") : "offline"}
          </span>
        );
      })}
    </div>
  );
}
