const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TIMEZONE_OFFSET_MINUTES = 14 * 60;

export interface UtcDayRange {
  start: string;
  end: string;
}

export function parseTimezoneOffset(rawValue: string | null): number | null {
  if (rawValue === null || rawValue === "") return 0;

  const offset = Number(rawValue);
  if (!Number.isInteger(offset) || Math.abs(offset) > MAX_TIMEZONE_OFFSET_MINUTES) {
    return null;
  }
  return offset;
}

export function getUtcDayRange(date: string, timezoneOffsetMinutes: number): UtcDayRange | null {
  if (!DATE_PATTERN.test(date)) return null;

  const utcMidnight = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(utcMidnight)) return null;
  if (new Date(utcMidnight).toISOString().slice(0, 10) !== date) return null;

  // Browser getTimezoneOffset(): UTC+8 is -480. Adding that offset converts
  // local midnight into the corresponding UTC instant.
  const startMs = utcMidnight + timezoneOffsetMinutes * 60_000;
  return {
    start: new Date(startMs).toISOString(),
    end: new Date(startMs + 24 * 60 * 60_000).toISOString(),
  };
}
