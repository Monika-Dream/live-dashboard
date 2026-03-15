function getGreeting(): { face: string; text: string } {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 9) return { face: "( *ˊᵕˋ)ノ", text: "早安~" };
  if (hour >= 9 && hour < 12) return { face: "(◕ᴗ◕✿)", text: "上午好~" };
  if (hour >= 12 && hour < 14) return { face: "(˘ω˘)", text: "该吃饭啦~" };
  if (hour >= 14 && hour < 18) return { face: "(´꒳`)", text: "下午好~" };
  if (hour >= 18 && hour < 22) return { face: "(✦ω✦)", text: "晚上好~" };
  return { face: "(ᴗ˳ᴗ)⁎", text: "晚安~" };
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
    <header className="pb-5 mb-8 separator-dashed animate-fade-up">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-[var(--font-display)] text-2xl tracking-tight text-[var(--color-primary)] leading-none">
            Monika Now
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1.5 font-[var(--font-jp)]">
            <span className="text-[var(--color-accent)] mr-1.5">{greeting.face}</span>
            {greeting.text}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {viewerCount > 0 && (
            <span className="text-[11px] font-bold text-[var(--color-accent)] bg-[var(--color-accent)]/10 px-2.5 py-1 rounded-full">
              {viewerCount} 人在看
            </span>
          )}
          <span className="font-[var(--font-display)] text-lg text-[var(--color-secondary)] leading-none">
            {timeStr}
          </span>
        </div>
      </div>
    </header>
  );
}
