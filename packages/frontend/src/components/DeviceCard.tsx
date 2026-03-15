import type { DeviceState } from "@/lib/api";

const platformIcons: Record<string, string> = {
  windows: "\u{1F5A5}",
  android: "\u{1F4F1}",
};

function timeAgo(isoStr: string): string {
  if (!isoStr) return "";
  const ts = new Date(isoStr).getTime();
  if (isNaN(ts)) return "";
  const diff = Date.now() - ts;
  if (diff < 0) return "just now";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function DeviceCard({ device }: { device: DeviceState }) {
  const isOnline = device.is_online === 1;
  const icon = platformIcons[device.platform] || "\u{1F4BB}";
  const battery = device.extra;
  const hasBattery = battery && typeof battery.battery_percent === "number";

  return (
    <div className={`card-decorated px-3.5 py-3 flex items-center gap-3 ${isOnline ? "" : "opacity-50"}`}>
      <span className="text-lg flex-shrink-0" aria-hidden="true">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold truncate">{device.device_name}</span>
          {isOnline && (
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-[var(--color-secondary)]"
              style={isOnline ? { boxShadow: "0 0 6px var(--color-secondary)" } : undefined}
            />
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {isOnline && hasBattery && (
            <span className="text-[10px] text-[var(--color-text-muted)]">
              {battery.battery_charging ? "\u26A1" : "\u{1F50B}"}{battery.battery_percent}%
            </span>
          )}
          <span className="text-[10px] text-[var(--color-text-muted)]">
            {isOnline ? timeAgo(device.last_seen_at) : "offline"}
          </span>
        </div>
      </div>
      <span className="text-xs flex-shrink-0 text-[var(--color-text-muted)]" title={isOnline ? "Online" : "Offline"}>
        {isOnline ? "(=^-ω-^=)" : "(-.-)zzZ"}
      </span>
    </div>
  );
}
