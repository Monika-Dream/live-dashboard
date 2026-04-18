import type { DeviceState } from "@/lib/api";

const platformIcons: Record<string, string> = {
  windows: "\u{1F5A5}",
  android: "\u{1F4F1}",
};

function timeAgo(isoStr: string): string {
  if (!isoStr) return "unknown";
  const ts = new Date(isoStr).getTime();
  if (isNaN(ts)) return "unknown";
  const diff = Date.now() - ts;
  if (diff < 0) return "just now";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface DeviceCardProps {
  device: DeviceState;
  selected?: boolean;
  onSelect?: () => void;
}

export default function DeviceCard({ device, selected, onSelect }: DeviceCardProps) {
  const isOnline = device.is_online === 1;
  const icon = platformIcons[device.platform] || "\u{1F4BB}";
  const battery = device.extra;
  const hasBattery = battery && typeof battery.battery_percent === "number";

  return (
    <div
      className={`card-decorated rounded-md px-3 py-2.5 flex items-center gap-2.5 cursor-pointer transition-all ${
        selected
          ? "border-l-[3px] border-l-[var(--color-primary)] bg-[var(--color-sakura-bg,rgba(255,183,197,0.1))]"
          : ""
      }`}
      onClick={onSelect}
    >
      <span className="text-base" aria-hidden="true">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold truncate">{device.device_name}</span>
          {isOnline && hasBattery && (
            <span className="text-[10px] text-[var(--color-text-muted)] flex-shrink-0">
              {battery.battery_charging ? "\u26A1" : "\u{1F50B}"}{battery.battery_percent}%
            </span>
          )}
        </div>
        <span className="text-[10px] text-[var(--color-text-muted)]">
          {isOnline ? timeAgo(device.last_seen_at) : "offline"}
        </span>
      </div>
      <span className="text-xs flex-shrink-0" title={isOnline ? "Online" : "Offline"}>
        {isOnline ? "(=^-\u03C9-^=)" : "(-.-)zzZ"}
      </span>
    </div>
  );
}
