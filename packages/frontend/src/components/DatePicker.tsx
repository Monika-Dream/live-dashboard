interface Props {
  selectedDate: string;
  onChange: (date: string) => void;
}

function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDisplay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function DatePicker({ selectedDate, onChange }: Props) {
  const isToday = selectedDate === todayStr();

  return (
    <div className="flex items-center gap-2">
      <button
        className="btn-glass"
        onClick={() => onChange(offsetDate(selectedDate, -1))}
        aria-label="Previous day"
      >
        &larr;
      </button>

      <span className="text-sm font-mono text-[var(--color-text-secondary)] tabular-nums px-2 min-w-[80px] text-center">
        {formatDisplay(selectedDate)}
      </span>

      <button
        className="btn-glass"
        onClick={() => onChange(offsetDate(selectedDate, 1))}
        disabled={isToday}
        aria-label="Next day"
      >
        &rarr;
      </button>

      {!isToday && (
        <button
          className="btn-glass text-[var(--color-accent)]"
          onClick={() => onChange(todayStr())}
        >
          Today
        </button>
      )}
    </div>
  );
}
