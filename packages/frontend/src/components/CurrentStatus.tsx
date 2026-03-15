import type { DeviceState } from "@/lib/api";
import { getAppDescription } from "@/lib/app-descriptions";

interface Props {
  devices: DeviceState[];
}

export default function CurrentStatus({ devices }: Props) {
  const onlineDevices = devices.filter((d) => d.is_online === 1);
  const active = onlineDevices.sort((a, b) => {
    const ta = a.last_seen_at ? new Date(a.last_seen_at).getTime() : 0;
    const tb = b.last_seen_at ? new Date(b.last_seen_at).getTime() : 0;
    return tb - ta;
  })[0];

  const isOnline = !!active;
  const description = active
    ? getAppDescription(active.app_name, active.display_title)
    : null;

  const battery = active?.extra;
  const hasBattery = battery && typeof battery.battery_percent === "number";

  return (
    <div className="status-bubble mb-8 animate-fade-up" style={{ animationDelay: "0.1s" }}>
      {/* Cat ears */}
      <div className="status-ears" aria-hidden="true">
        <span className="ear ear-left" />
        <span className="ear ear-right" />
      </div>

      {/* Main content */}
      <div className="px-6 py-5 text-center">
        {isOnline ? (
          <>
            <p className="text-xs text-[var(--color-text-muted)] mb-1.5 font-[var(--font-jp)]">
              Monika 现在...
            </p>
            <p className="text-lg font-bold font-[var(--font-jp)] text-[var(--color-primary)] leading-relaxed status-text">
              {description}
            </p>
            <div className="flex items-center justify-center gap-3 mt-2">
              {hasBattery && (
                <span className="text-[10px] text-[var(--color-text-muted)] bg-[var(--color-sakura-bg)] px-2 py-0.5 rounded-full">
                  {battery.battery_charging ? "\u26A1" : "\u{1F50B}"}{battery.battery_percent}%
                </span>
              )}
              {onlineDevices.length > 1 && (
                <span className="text-[10px] text-[var(--color-text-muted)] bg-[var(--color-sakura-bg)] px-2 py-0.5 rounded-full">
                  {onlineDevices.length} 台设备在线
                </span>
              )}
            </div>
          </>
        ) : (
          <div className="py-2">
            <p className="text-2xl mb-1.5 leading-none">(ᴗ˳ᴗ) zzZ</p>
            <p className="text-sm text-[var(--color-text-muted)] font-[var(--font-jp)]">
              Monika 不在喵~ 也许在做梦吧
            </p>
          </div>
        )}
      </div>

      {/* Triangle pointer */}
      <div className="status-pointer" aria-hidden="true" />
    </div>
  );
}
