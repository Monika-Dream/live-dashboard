"use client";

function getGreeting(): { text: string; period: string } {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 9) return { text: "早安", period: "morning" };
  if (hour >= 9 && hour < 12) return { text: "上午好", period: "morning" };
  if (hour >= 12 && hour < 14) return { text: "午安", period: "noon" };
  if (hour >= 14 && hour < 18) return { text: "下午好", period: "afternoon" };
  if (hour >= 18 && hour < 22) return { text: "晚上好", period: "evening" };
  return { text: "夜深了", period: "night" };
}

interface HeaderProps {
  serverTime?: string;
  viewerCount?: number;
}

export default function Header({ serverTime, viewerCount = 0 }: HeaderProps) {
  const timeStr = (() => {
    if (!serverTime) return "--:--";
    const d = new Date(serverTime);
    if (isNaN(d.getTime())) return "--:--";
    return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  })();

  const greeting = getGreeting();

  return (
    <header className="mb-10">
      <div className="flex items-end justify-between">
        {/* Left: title */}
        <div>
          <h1 className="text-3xl font-semibold font-[var(--font-display)] gradient-text leading-tight tracking-tight">
            Monika Now
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-2 font-light tracking-wide">
            {greeting.text}
          </p>
        </div>

        {/* Right: meta */}
        <div className="text-right flex flex-col items-end gap-1.5">
          <p className="text-lg font-mono font-medium text-[var(--color-text-secondary)] tabular-nums">
            {timeStr}
          </p>
          {viewerCount > 0 && (
            <p className="text-[11px] text-[var(--color-text-muted)]">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-emerald)] mr-1.5 relative top-[-1px]" />
              {viewerCount} watching
            </p>
          )}
        </div>
      </div>

      {/* Subtle separator */}
      <div className="separator mt-6" />
    </header>
  );
}
