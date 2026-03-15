import type { DeviceState } from "@/lib/api";

const platformIcons: Record<string, string> = {
  windows: "🖥",
  android: "📱",
};

function timeAgo(isoStr: string): string {
  if (!isoStr) return "";
  const ts = new Date(isoStr).getTime();
  if (isNaN(ts)) return "";
  const diff = Date.now() - ts;
  if (diff < 0) return "now";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export default function DeviceCard({ device }: { device: DeviceState }) {
  const isOnline = device.is_online === 1;
  const icon = platformIcons[device.platform] || "💻";
  const battery = device.extra;
  const hasBattery = battery && typeof battery.battery_percent === "number";

  return (
    <div className={`device-row ${isOnline ? "" : "offline"}`}>
      <span className="text-sm" aria-hidden="true">{icon}</span>
      <span className={`device-dot ${isOnline ? "online" : "offline"}`} />
      <span className="font-medium flex-1 truncate">{device.device_name}</span>
      {isOnline && hasBattery && (
        <span className="text-[var(--color-text-dim)] text-[0.7rem]">
          {battery.battery_charging ? "⚡" : ""}{battery.battery_percent}%
        </span>
      )}
      <span className="text-[var(--color-text-dim)] text-[0.7rem] font-[var(--font-mono)]">
        {isOnline ? timeAgo(device.last_seen_at) : "off"}
      </span>
    </div>
  );
}
