import { describe, expect, it } from "vitest";
import type { LessonSlot } from "../../types";
import { buildSubjectOptions, lessonSubjectKeys, normalizeSubjectKey } from "./noteClassifier";

const subgroupLesson: LessonSlot = {
  id: "friday-1",
  dayIndex: 5,
  dayName: "Пятница",
  pairIndex: 1,
  start: "08:30",
  end: "10:00",
  subject: "Основы frontend разработки / Алгоритмизация и программирование",
  room: "109-3 / 111-3",
  kind: "лб",
  teacher: "Аджамиех С.М. / Старовойтов Е.А.",
  rawText: "subgroups",
  weekMode: "all",
  variants: [
    { subject: "Основы frontend разработки", room: "109-3", kind: "лб", teacher: "Аджамиех С.М.", rawText: "frontend" },
    { subject: "Алгоритмизация и программирование", room: "111-3", kind: "лб", teacher: "Старовойтов Е.А.", rawText: "algorithms" }
  ]
};

describe("subgroup subject context", () => {
  it("exposes every subgroup subject as an independent key", () => {
    expect(lessonSubjectKeys(subgroupLesson)).toEqual([
      normalizeSubjectKey("Основы frontend разработки"),
      normalizeSubjectKey("Алгоритмизация и программирование")
    ]);
  });

  it("builds independent subject choices for smart notes", () => {
    const subjects = buildSubjectOptions([subgroupLesson], "numerator", new Date("2026-07-13T07:00:00"));
    expect(subjects.map((subject) => subject.label)).toEqual([
      "Алгоритмизация и программирование",
      "Основы frontend разработки"
    ]);
  });
});
