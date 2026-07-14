import { describe, expect, test } from "bun:test";

import { getUtcDayRange, parseTimezoneOffset } from "./date-range";

describe("parseTimezoneOffset", () => {
  test("accepts browser timezone offsets", () => {
    expect(parseTimezoneOffset(null)).toBe(0);
    expect(parseTimezoneOffset("-480")).toBe(-480);
    expect(parseTimezoneOffset("330")).toBe(330);
  });

  test("rejects malformed or out-of-range offsets", () => {
    expect(parseTimezoneOffset("480abc")).toBeNull();
    expect(parseTimezoneOffset("841")).toBeNull();
    expect(parseTimezoneOffset("1.5")).toBeNull();
  });
});

describe("getUtcDayRange", () => {
  test("keeps UTC dates unchanged", () => {
    expect(getUtcDayRange("2026-07-11", 0)).toEqual({
      start: "2026-07-11T00:00:00.000Z",
      end: "2026-07-12T00:00:00.000Z",
    });
  });

  test("converts UTC+8 local day to an indexed UTC range", () => {
    expect(getUtcDayRange("2026-07-11", -480)).toEqual({
      start: "2026-07-10T16:00:00.000Z",
      end: "2026-07-11T16:00:00.000Z",
    });
  });

  test("converts UTC-5:30 local day to an indexed UTC range", () => {
    expect(getUtcDayRange("2026-07-11", 330)).toEqual({
      start: "2026-07-11T05:30:00.000Z",
      end: "2026-07-12T05:30:00.000Z",
    });
  });

  test("rejects impossible calendar dates", () => {
    expect(getUtcDayRange("2026-02-30", 0)).toBeNull();
  });
});
