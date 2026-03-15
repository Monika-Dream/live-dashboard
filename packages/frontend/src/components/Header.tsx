function getGreeting(): { icon: string; text: string } {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 9) return { icon: "☀", text: "早安" };
  if (hour >= 9 && hour < 12) return { icon: "✿", text: "上午好" };
  if (hour >= 12 && hour < 14) return { icon: "☕", text: "午休中" };
  if (hour >= 14 && hour < 18) return { icon: "♪", text: "下午好" };
  if (hour >= 18 && hour < 22) return { icon: "☽", text: "晚上好" };
  return { icon: "✧", text: "深夜了" };
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
    <header className="flex items-center justify-between py-3 mb-2 animate-in">
      <div className="flex items-center gap-2">
        <h1 className="font-[var(--font-heading)] text-base font-bold text-[var(--color-text)]">
          Monika Now
        </h1>
        <span className="text-xs text-[var(--color-text-dim)]">
          {greeting.icon} {greeting.text}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {viewerCount > 0 && (
          <span className="text-[0.65rem] text-[var(--color-text-dim)]">
            {viewerCount} online
          </span>
        )}
        <span className="font-[var(--font-mono)] text-sm font-bold text-[var(--color-text-dim)]">
          {timeStr}
        </span>
      </div>
    </header>
  );
}
