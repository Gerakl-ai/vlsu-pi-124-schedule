import { describe, expect, it } from "vitest";
import { weekModeForDate, weekModeFromSnapshot } from "./time";

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

describe("weekModeFromSnapshot", () => {
  it("advances a stale cached week type to the week being viewed", () => {
    expect(weekModeFromSnapshot(
      "denominator",
      "2026-09-09T13:40:00.000Z",
      new Date("2026-09-15T11:44:00")
    )).toBe("numerator");
  });

  it("keeps the reported type inside the snapshot week", () => {
    expect(weekModeFromSnapshot(
      "numerator",
      "2026-09-15T08:00:00.000Z",
      new Date("2026-09-18T12:00:00")
    )).toBe("numerator");
  });

  it("falls back to the reported type for legacy invalid timestamps", () => {
    expect(weekModeFromSnapshot("denominator", "invalid", new Date("2026-09-15T11:44:00"))).toBe("denominator");
  });
});
