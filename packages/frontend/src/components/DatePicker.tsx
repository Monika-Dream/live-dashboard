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

function formatDisplay(dateStr: string): string {
  const d = parseDate(dateStr);
  const month = d.toLocaleDateString("en-US", { month: "short" });
  const day = d.getDate();
  const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
  return `${month} ${day} (${weekday})`;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function DatePicker({ selectedDate, onChange }: Props) {
  const isToday = selectedDate === todayStr();

  return (
    <div className="flex items-center gap-2">
      {/* Calendar flip visual */}
      <div className="card-decorated rounded-md w-14 h-16 flex flex-col items-center justify-center flex-shrink-0">
        <span className="text-[10px] font-bold text-[var(--color-primary)] uppercase leading-none">
          {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", { month: "short" })}
        </span>
        <span className="text-xl font-bold leading-tight">
          {new Date(selectedDate + "T00:00:00").getDate()}
        </span>
        <span className="text-[9px] text-[var(--color-text-muted)] leading-none">
          {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short" })}
        </span>
      </div>

      {/* Navigation arrows */}
      <div className="flex flex-col gap-1">
        <button
          className="pill-btn text-xs px-2 py-1"
          onClick={() => onChange(offsetDate(selectedDate, -1))}
          aria-label="Previous day"
        >
          &larr; prev
        </button>
        <button
          className="pill-btn text-xs px-2 py-1"
          onClick={() => onChange(offsetDate(selectedDate, 1))}
          disabled={isToday}
          aria-label="Next day"
          style={isToday ? { opacity: 0.4, cursor: "default" } : undefined}
        >
          next &rarr;
        </button>
      </div>

      {/* Today shortcut */}
      {!isToday && (
        <button
          className="pill-btn text-xs"
          onClick={() => onChange(todayStr())}
        >
          today
        </button>
      )}
    </div>
  );
}
