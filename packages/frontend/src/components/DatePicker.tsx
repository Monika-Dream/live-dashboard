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

function formatDate(dateStr: string): string {
  const d = parseDate(dateStr);
  const m = d.toLocaleDateString("en-US", { month: "short" });
  const day = d.getDate();
  const wd = d.toLocaleDateString("en-US", { weekday: "short" });
  return `${m} ${day} (${wd})`;
}

export default function DatePicker({ selectedDate, onChange }: Props) {
  const isToday = selectedDate === todayStr();

  return (
    <div className="date-nav">
      <button
        className="date-nav-btn"
        onClick={() => onChange(offsetDate(selectedDate, -1))}
        aria-label="Previous day"
      >
        ◂
      </button>

      <span className="font-[var(--font-mono)] text-[0.75rem] font-bold min-w-[110px] text-center">
        {formatDate(selectedDate)}
      </span>

      <button
        className="date-nav-btn"
        onClick={() => onChange(offsetDate(selectedDate, 1))}
        disabled={isToday}
        aria-label="Next day"
      >
        ▸
      </button>

      {!isToday && (
        <button
          className="date-today-btn"
          onClick={() => onChange(todayStr())}
        >
          today
        </button>
      )}
    </div>
  );
}
