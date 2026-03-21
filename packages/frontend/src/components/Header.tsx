function getGreeting(): { kaomoji: string; text: string } {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 9) return { kaomoji: "(* ^ ω ^)", text: "早上好呀~" };
  if (hour >= 9 && hour < 12) return { kaomoji: "(o´▽`o)", text: "上午好呀~" };
  if (hour >= 12 && hour < 14) return { kaomoji: "(´～`)", text: "午饭时间~" };
  if (hour >= 14 && hour < 18) return { kaomoji: "(◕‿◕)", text: "下午好呀~" };
  if (hour >= 18 && hour < 22) return { kaomoji: "(✿╹◡╹)", text: "晚上好呀~" };
  return { kaomoji: "(￣o￣) . z Z", text: "夜深了喵~" };
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
    <header className="pb-4 mb-6 separator-dashed">
      <div className="flex items-end justify-between">
        {/* Left: title + greeting */}
        <div>
          <h1 className="text-xl font-bold font-[var(--font-jp)] text-[var(--color-text)] leading-tight">
            Isabelle Now
          </h1>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            <span className="mr-1">{greeting.kaomoji}</span>
            {greeting.text}
          </p>
        </div>

        {/* Right: viewer count + time */}
        <div className="text-right flex flex-col items-end gap-0.5">
          {viewerCount > 0 && (
            <p className="text-xs text-[var(--color-primary)] font-medium">
              {viewerCount} 人在看喵~
            </p>
          )}
          <p className="text-sm font-mono font-medium text-[var(--color-secondary)]">
            {timeStr}
          </p>
        </div>
      </div>
    </header>
  );
}
