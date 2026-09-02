import { dateKeyFromDate } from "../../lib/time";
import type { LessonSlot } from "../../types";
import { lessonSubjectKeys } from "./noteClassifier";
import type { LessonNoteContext, SmartNote } from "./noteTypes";

export function createLessonNoteContext(
  lesson: LessonSlot,
  date: Date,
  intent: LessonNoteContext["intent"],
  scope: LessonNoteContext["scope"] = "lesson"
): LessonNoteContext {
  return {
    lessonId: lesson.id,
    date: lesson.date ?? dateKeyFromDate(date),
    start: lesson.start,
    subjectKeys: lessonSubjectKeys(lesson),
    subjectLabel: lesson.subject,
    scope,
    intent
  };
}

export function noteMatchesLesson(note: SmartNote, lesson: LessonSlot, date: Date) {
  if (note.status !== "open") return false;
  const lessonKeys = new Set(lessonSubjectKeys(lesson));
  const context = note.lessonContext;

  if (context?.scope === "lesson") {
    return context.lessonId === lesson.id
      && context.date === (lesson.date ?? dateKeyFromDate(date));
  }

  const noteKeys = context?.subjectKeys?.length
    ? context.subjectKeys
    : note.subjectKey
      ? [note.subjectKey]
      : [];
  return noteKeys.some((key) => lessonKeys.has(key));
}

export function notesLinkedToLesson(lesson: LessonSlot | undefined, notes: SmartNote[], date: Date) {
  if (!lesson) return [];
  return notes.filter((note) => noteMatchesLesson(note, lesson, date));
}
