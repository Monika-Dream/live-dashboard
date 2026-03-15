interface Props {
  selectedDate: string;
  onChange: (date: string) => void;
}

function parseDate(dateStr: string): Date {
  const d = new Date(dateStr + "T00:00:00");
  return isNaN(d.getTime()) ? new Date() : d;
}

function offsetDate(dateStr: string, days: number): string {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function DatePicker({ selectedDate, onChange }: Props) {
  const isToday = selectedDate === todayStr();
  const parsed = parseDate(selectedDate);

  return (
    <div className="flex items-center gap-3">
      {/* Calendar visual */}
      <div className="card-decorated w-14 h-16 flex flex-col items-center justify-center flex-shrink-0">
        <span className="text-[10px] font-bold text-[var(--color-primary)] uppercase leading-none">
          {parsed.toLocaleDateString("en-US", { month: "short" })}
        </span>
        <span className="text-xl font-[var(--font-display)] leading-tight text-[var(--color-text)]">
          {parsed.getDate()}
        </span>
        <span className="text-[9px] text-[var(--color-text-muted)] leading-none">
          {parsed.toLocaleDateString("en-US", { weekday: "short" })}
        </span>
      </div>

      {/* Nav buttons */}
      <div className="flex items-center gap-1.5">
        <button
          className="pill-btn text-[11px] px-3 py-1"
          onClick={() => onChange(offsetDate(selectedDate, -1))}
          aria-label="Previous day"
        >
          &larr;
        </button>
        <button
          className="pill-btn text-[11px] px-3 py-1"
          onClick={() => onChange(offsetDate(selectedDate, 1))}
          disabled={isToday}
          aria-label="Next day"
          style={isToday ? { opacity: 0.35, cursor: "default" } : undefined}
        >
          &rarr;
        </button>
      </div>

      {/* Today shortcut */}
      {!isToday && (
        <button
          className="pill-btn text-[11px]"
          onClick={() => onChange(todayStr())}
        >
          today
        </button>
      )}
    </div>
  );
}
