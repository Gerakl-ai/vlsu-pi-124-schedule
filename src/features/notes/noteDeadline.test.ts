import { describe, expect, it } from "vitest";
import {
  deadlineForCalendarDate,
  localDateTimeToIso,
  resolveNoteDeadline,
  toLocalDateTimeValue
} from "./noteDeadline";
import type { NoteClassification } from "./noteTypes";

const automatic: NoteClassification = {
  kind: "task",
  space: "Дела",
  confidence: 0.8,
  dueAt: "2026-07-20T09:00:00.000Z",
  dueLabel: "До понедельника"
};

describe("note deadlines", () => {
  it("round-trips a native local datetime value", () => {
    const local = new Date(2026, 6, 18, 19, 45, 0, 0);
    expect(toLocalDateTimeValue(local.toISOString())).toBe("2026-07-18T19:45");
    expect(localDateTimeToIso("2026-07-18T19:45")).toBe(local.toISOString());
  });

  it("keeps automatic classification until the user overrides it", () => {
    expect(resolveNoteDeadline(automatic)).toEqual({
      dueAt: automatic.dueAt,
      dueLabel: automatic.dueLabel,
      dueManual: false
    });
  });

  it("protects an exact manual deadline and supports an explicit clear", () => {
    const manual = new Date(2026, 7, 4, 18, 30, 0, 0).toISOString();
    expect(resolveNoteDeadline(automatic, manual)).toMatchObject({ dueAt: manual, dueManual: true });
    expect(resolveNoteDeadline(automatic, null)).toEqual({ dueAt: undefined, dueLabel: undefined, dueManual: true });
  });

  it("uses 18:00 for a future calendar day", () => {
    const result = new Date(deadlineForCalendarDate(new Date(2026, 7, 4), new Date(2026, 6, 17, 12, 10)));
    expect([result.getFullYear(), result.getMonth(), result.getDate(), result.getHours(), result.getMinutes()]).toEqual([2026, 7, 4, 18, 0]);
  });

  it("uses the next half-hour for today without crossing midnight", () => {
    const today = new Date(2026, 6, 17, 10, 12);
    const result = new Date(deadlineForCalendarDate(today, today));
    expect([result.getHours(), result.getMinutes()]).toEqual([10, 30]);

    const late = new Date(2026, 6, 17, 23, 55);
    const lateResult = new Date(deadlineForCalendarDate(late, late));
    expect([lateResult.getDate(), lateResult.getHours(), lateResult.getMinutes()]).toEqual([17, 23, 59]);
  });
});
