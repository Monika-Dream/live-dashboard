import type { DeviceState } from "@/lib/api";
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
  const description = active?.status_text ?? "正在忙别的喵~";

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

  // 后端按隐私分级提取好的细节标题（B站视频名 / 正在写的文件 / 网页标题…）。
  // 音乐播放器场景下 display_title 往往就是歌名，和 ♪ 行重复时不再展示；
  // 和应用名一字不差时（如 JQuake 窗口标题就叫 JQuake）也属于零信息，不展示。
  const rawDetail = active?.display_title?.trim() || null;
  const detail =
    rawDetail &&
    ((music?.title && rawDetail.includes(music.title)) ||
      rawDetail === active?.app_name)
      ? null
      : rawDetail;

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
            {detail && (
              <p className="text-xs text-[var(--color-text-muted)] mt-1 break-all">
                「{detail}」
              </p>
            )}
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
