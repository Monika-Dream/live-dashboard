import type { DeviceState } from "@/lib/api";
import { getAppDescription } from "@/lib/app-descriptions";

interface Props {
  devices: DeviceState[];
}

export default function CurrentStatus({ devices }: Props) {
  // Find the most recently active online device
  const onlineDevices = devices.filter((d) => d.is_online === 1);
  const active = onlineDevices.sort((a, b) => {
    const ta = a.last_seen_at ? new Date(a.last_seen_at).getTime() : 0;
    const tb = b.last_seen_at ? new Date(b.last_seen_at).getTime() : 0;
    return tb - ta;
  })[0];

  const isOnline = !!active;
  const description = active
    ? getAppDescription(active.app_name, active.display_title, active.extra?.music)
    : null;

  // Battery info from the active device
  const battery = active?.extra;
  const hasBattery = battery && typeof battery.battery_percent === "number";

  return (
    <div className="status-bubble mb-6">
      {/* Cat ears */}
      <div className="status-ears" aria-hidden="true">
        <span className="ear ear-left" />
        <span className="ear ear-right" />
      </div>

      {/* Main content */}
      <div className="px-5 py-4 text-center">
        {isOnline ? (
          <>
            <p className="text-xs text-[var(--color-text-muted)] mb-1">
              Isabelle 现在...
            </p>
            <p className="text-lg font-bold font-[var(--font-jp)] text-[var(--color-primary)] leading-relaxed status-text">
              {description}
            </p>
            <div className="flex items-center justify-center gap-3 mt-1.5">
              {hasBattery && (
                <span className="text-[10px] text-[var(--color-text-muted)]">
                  {battery.battery_charging ? "\u26A1" : "\u{1F50B}"}{battery.battery_percent}%
                </span>
              )}
              {onlineDevices.length > 1 && (
                <span className="text-[10px] text-[var(--color-text-muted)]">
                  {onlineDevices.length} 台设备在线中
                </span>
              )}
            </div>
          </>
        ) : (
          <div className="py-1">
            <p className="text-xl mb-1">(-.-)zzZ</p>
            <p className="text-sm text-[var(--color-text-muted)]">
              Isabelle 不在电脑前喵~
            </p>
          </div>
        )}
      </div>

      {/* Triangle pointer */}
      <div className="status-pointer" aria-hidden="true" />
    </div>
  );
}
