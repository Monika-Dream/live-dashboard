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
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  })[0];

  const isOnline = !!active;
  const description = active
    ? getAppDescription(active.app_name, active.display_title)
    : null;

  const battery = active?.extra;
  const hasBattery = battery && typeof battery.battery_percent === "number";
  const music = active?.extra?.music;

  return (
    <div className={`glass-hero ${isOnline ? "glow-breathe" : ""}`}>
      <div className="px-8 py-8 text-center">
        {isOnline ? (
          <>
            {/* Status label */}
            <div className="flex items-center justify-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-[var(--color-emerald)] pulse-dot" />
              <span className="text-[11px] font-medium text-[var(--color-emerald)] uppercase tracking-[0.15em]">
                Online
              </span>
            </div>

            {/* Main description */}
            <p className="text-xl font-medium text-[var(--color-text)] leading-relaxed">
              {description}
            </p>

            {/* Music indicator */}
            {music?.title && (
              <div className="mt-4 flex items-center justify-center gap-2.5">
                <div className="flex items-end gap-[2px] h-4">
                  <div className="music-bar" />
                  <div className="music-bar" />
                  <div className="music-bar" />
                  <div className="music-bar" />
                </div>
                <span className="text-xs text-[var(--color-accent-soft)]">
                  {music.artist ? `${music.artist} — ${music.title}` : music.title}
                </span>
              </div>
            )}

            {/* Meta row */}
            <div className="flex items-center justify-center gap-4 mt-4">
              {hasBattery && (
                <span className="text-[11px] text-[var(--color-text-muted)] tabular-nums">
                  {battery.battery_charging ? "\u26A1" : ""}{battery.battery_percent}%
                </span>
              )}
              {onlineDevices.length > 1 && (
                <span className="text-[11px] text-[var(--color-text-muted)]">
                  {onlineDevices.length} devices
                </span>
              )}
            </div>
          </>
        ) : (
          <div className="py-4">
            <p className="text-3xl mb-3 opacity-60">( -.-)zzZ</p>
            <p className="text-sm text-[var(--color-text-muted)] font-light">
              Monika 不在线
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
