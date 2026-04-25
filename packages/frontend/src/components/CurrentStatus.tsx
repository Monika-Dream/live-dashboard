import type { DeviceState } from "@/lib/api";
import { getAppDescription } from "@/lib/app-descriptions";
import { useConfig } from "@/hooks/useConfig";

interface Props {
  device: DeviceState | undefined;
  displayName?: string;
}

export default function CurrentStatus({ device, displayName: displayNameProp }: Props) {
  const { displayName: configDisplayName } = useConfig();
  const displayName = displayNameProp ?? configDisplayName;
  const active = device?.is_online === 1 ? device : undefined;

  const isOnline = !!active;
  const customDescription = active?.extra?.custom_description?.trim();
  const description = active
    ? (customDescription || getAppDescription(active.app_name, active.display_title, active.extra?.music))
    : null;

  // Battery info from the active device
  const battery = active?.extra;
  const hasBattery = battery && typeof battery.battery_percent === "number";

  // Music info — show standalone ♪ line, description should not duplicate it
  const music = active?.extra?.music;
  const musicText = music?.title
    ? music.artist
      ? `${music.artist} - ${music.title}`
      : music.title
    : null;

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
              {displayName} 现在...
            </p>
            <p className="text-lg font-bold font-[var(--font-jp)] text-[var(--color-primary)] leading-relaxed status-text">
              {description}
            </p>
            {musicText && (
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                ♪ 正在听：{musicText}
              </p>
            )}
            {hasBattery && battery && (
              <div className="flex items-center justify-center gap-3 mt-1.5">
                <span className="text-[10px] text-[var(--color-text-muted)]">
                  {battery.battery_charging ? "\u26A1" : "\u{1F50B}"}{battery.battery_percent}%
                </span>
              </div>
            )}
          </>
        ) : (
          <div className="py-1">
            <p className="text-xl mb-1">(-.-)zzZ</p>
            <p className="text-sm text-[var(--color-text-muted)]">
              {displayName} 不在电脑前喵~
            </p>
          </div>
        )}
      </div>

      {/* Triangle pointer */}
      <div className="status-pointer" aria-hidden="true" />
    </div>
  );
}
