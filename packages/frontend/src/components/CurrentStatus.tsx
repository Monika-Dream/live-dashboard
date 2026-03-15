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
    <div className="status-hero animate-in" style={{ animationDelay: "0.05s" }}>
      {isOnline ? (
        <>
          <div className="status-kaomoji status-float" aria-hidden="true">
            (◕ᴗ◕)
          </div>
          <p className="status-description">{description}</p>
          <div className="status-meta">
            {hasBattery && (
              <span>
                {battery.battery_charging ? "⚡" : "🔋"} {battery.battery_percent}%
              </span>
            )}
            {onlineDevices.length > 1 && (
              <span>{onlineDevices.length} 台设备</span>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="status-offline-face" aria-hidden="true">
            (ᴗ˳ᴗ) zzZ
          </div>
          <p className="text-sm text-[var(--color-text-dim)]">
            Monika 不在~ 也许在做梦吧
          </p>
        </>
      )}
    </div>
  );
}
