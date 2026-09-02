import { describe, expect, it } from "vitest";
import { weekModeForDate } from "./time";

describe("weekModeForDate", () => {
  const base = new Date("2026-09-02T12:00:00");

  it("keeps the current mode inside the same week", () => {
    expect(weekModeForDate(new Date("2026-09-04T12:00:00"), "numerator", base)).toBe("numerator");
  });

  it("alternates modes for adjacent weeks in both directions", () => {
    expect(weekModeForDate(new Date("2026-09-09T12:00:00"), "numerator", base)).toBe("denominator");
    expect(weekModeForDate(new Date("2026-08-26T12:00:00"), "denominator", base)).toBe("numerator");
  });
});
