import { describe, expect, it } from "vitest";
import { shiftCalendarMonth } from "./calendarMonth";

describe("shiftCalendarMonth", () => {
  it("keeps the selected day when the next month has it", () => {
    expect(shiftCalendarMonth(new Date(2026, 8, 15), 1).getDate()).toBe(15);
  });

  it("clamps the day for a shorter month", () => {
    expect(shiftCalendarMonth(new Date(2026, 0, 31), 1).toDateString()).toBe(new Date(2026, 1, 28).toDateString());
  });

  it("crosses the year boundary", () => {
    expect(shiftCalendarMonth(new Date(2026, 11, 12), 1).toDateString()).toBe(new Date(2027, 0, 12).toDateString());
  });
});
