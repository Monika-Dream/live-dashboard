import type { DeviceState } from "@/lib/api";

const platformIcons: Record<string, string> = {
  windows: "\u{1F5A5}",
  android: "\u{1F4F1}",
  macos: "\u{1F4BB}",
};

function timeAgo(isoStr: string): string {
  if (!isoStr) return "";
  const ts = new Date(isoStr).getTime();
  if (isNaN(ts)) return "";
  const diff = Date.now() - ts;
  if (diff < 0) return "just now";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

export default function DeviceCard({ device }: { device: DeviceState }) {
  const isOnline = device.is_online === 1;
  const icon = platformIcons[device.platform] || "\u{1F4BB}";
  const battery = device.extra;
  const hasBattery = battery && typeof battery.battery_percent === "number";

  return (
    <div className="glass-sm px-4 py-3 flex items-center gap-3 group">
      {/* Icon */}
      <span className="text-lg opacity-70 group-hover:opacity-100 transition-opacity" aria-hidden="true">
        {icon}
      </span>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{device.device_name}</span>
          {isOnline && hasBattery && (
            <span className="text-[10px] text-[var(--color-text-muted)] tabular-nums font-mono flex-shrink-0">
              {battery.battery_charging ? "\u26A1" : ""}{battery.battery_percent}%
            </span>
          )}
        </div>
        <span className="text-[11px] text-[var(--color-text-muted)]">
          {isOnline ? timeAgo(device.last_seen_at) : "offline"}
        </span>
      </div>

      {/* Status dot */}
      <span
        className={`w-2 h-2 rounded-full flex-shrink-0 transition-colors duration-500 ${
          isOnline ? "bg-[var(--color-emerald)] pulse-dot" : "bg-[var(--color-text-muted)] opacity-30"
        }`}
      />
    </div>
  );
}
