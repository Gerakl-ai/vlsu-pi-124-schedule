import { describe, expect, it } from "vitest";
import type { LessonSlot } from "../../types";
import { createLessonNoteContext, noteMatchesLesson } from "./noteLinking";
import type { SmartNote } from "./noteTypes";

const lesson: LessonSlot = {
  id: "database-tuesday-3",
  dayIndex: 2,
  dayName: "Вторник",
  pairIndex: 3,
  start: "12:10",
  end: "13:40",
  subject: "Базы данных",
  rawText: "Базы данных",
  weekMode: "all"
};

function note(context: SmartNote["lessonContext"]): SmartNote {
  return {
    id: "note-1",
    text: "Сделать лабораторную",
    title: "Сделать лабораторную",
    status: "open",
    pinned: false,
    space: "Учёба",
    topic: "Базы данных",
    kind: "homework",
    confidence: 1,
    classificationSource: "local",
    createdAt: "2026-09-02T10:00:00.000Z",
    updatedAt: "2026-09-02T10:00:00.000Z",
    lessonContext: context
  };
}

describe("lesson note linking", () => {
  const firstDate = new Date("2026-09-08T12:00:00");
  const nextDate = new Date("2026-09-15T12:00:00");

  it("keeps an exact note on one lesson occurrence", () => {
    const linked = note(createLessonNoteContext(lesson, firstDate, "homework", "lesson"));
    expect(noteMatchesLesson(linked, lesson, firstDate)).toBe(true);
    expect(noteMatchesLesson(linked, lesson, nextDate)).toBe(false);
  });

  it("shows a subject note on every occurrence", () => {
    const linked = note(createLessonNoteContext(lesson, firstDate, "note", "subject"));
    expect(noteMatchesLesson(linked, lesson, firstDate)).toBe(true);
    expect(noteMatchesLesson(linked, lesson, nextDate)).toBe(true);
  });

  it("hides completed notes from lessons", () => {
    const linked = { ...note(createLessonNoteContext(lesson, firstDate, "homework")), status: "done" as const };
    expect(noteMatchesLesson(linked, lesson, firstDate)).toBe(false);
  });

  it("never exposes a subject note in another group", () => {
    const linked = note(createLessonNoteContext(lesson, firstDate, "note", "subject", { nrec: "group-a", name: "ПИ-124" }));
    expect(noteMatchesLesson(linked, lesson, firstDate, "group-a")).toBe(true);
    expect(noteMatchesLesson(linked, lesson, firstDate, "group-b")).toBe(false);
  });
});
