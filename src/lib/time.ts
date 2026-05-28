import type { LessonSlot, WeekMode } from "../types";
import { lessonAppliesToWeek } from "./scheduleApi";

const DAY_NAME_TO_INDEX: Record<string, number> = {
  "Понедельник": 1,
  "Вторник": 2,
  "Среда": 3,
  "Четверг": 4,
  "Пятница": 5,
  "Суббота": 6,
  "Воскресенье": 7
};

export function currentDayIndex(date = new Date()) {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

export function minutesFromTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function nowMinutes(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes();
}

export function lessonProgress(lesson: LessonSlot, date = new Date()) {
  const start = minutesFromTime(lesson.start);
  const end = minutesFromTime(lesson.end);
  const now = nowMinutes(date);
  if (now <= start) return 0;
  if (now >= end) return 100;
  return Math.round(((now - start) / (end - start)) * 100);
}

export function minutesUntilEnd(lesson: LessonSlot, date = new Date()) {
  return Math.max(0, minutesFromTime(lesson.end) - nowMinutes(date));
}

export function selectDayLessons(lessons: LessonSlot[], dayIndex: number, weekMode: WeekMode) {
  return lessons
    .filter((lesson) => lesson.dayIndex === dayIndex && lessonAppliesToWeek(lesson, weekMode))
    .sort((a, b) => a.pairIndex - b.pairIndex || a.subject.localeCompare(b.subject, "ru"));
}

export function findCurrentAndNext(lessons: LessonSlot[], weekMode: WeekMode, date = new Date()) {
  const todayLessons = selectDayLessons(lessons, currentDayIndex(date), weekMode);
  const now = nowMinutes(date);
  const current = todayLessons.find((lesson) => minutesFromTime(lesson.start) <= now && now < minutesFromTime(lesson.end));
  const next = todayLessons.find((lesson) => minutesFromTime(lesson.start) > now);
  return { todayLessons, current, next };
}

export function dayIndexFromName(dayName: string) {
  return DAY_NAME_TO_INDEX[dayName] ?? 1;
}

export function formatUpdatedAt(iso?: string) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(iso));
}

export function formatWeekMode(mode: WeekMode) {
  if (mode === "numerator") return "Числитель";
  if (mode === "denominator") return "Знаменатель";
  return "Все недели";
}
