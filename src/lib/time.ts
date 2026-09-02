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

export function dateKeyFromDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() + days);
  return next;
}

export function dateForWeekDay(dayIndex: number, baseDate = new Date()) {
  const monday = addDays(baseDate, 1 - currentDayIndex(baseDate));
  return addDays(monday, dayIndex - 1);
}

export function weekModeForDate(date: Date, currentMode: WeekMode, baseDate = new Date()): WeekMode {
  if (currentMode === "all") return "all";
  const targetMonday = dateForWeekDay(1, date);
  const baseMonday = dateForWeekDay(1, baseDate);
  const weekDelta = Math.round((targetMonday.getTime() - baseMonday.getTime()) / 604_800_000);
  if (Math.abs(weekDelta) % 2 === 0) return currentMode;
  return currentMode === "numerator" ? "denominator" : "numerator";
}

export function hasDatedLessons(lessons: LessonSlot[]) {
  return lessons.some((lesson) => Boolean(lesson.date));
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

export function minutesUntilStart(lesson: LessonSlot, date = new Date()) {
  return Math.max(0, minutesFromTime(lesson.start) - nowMinutes(date));
}

export function lessonTimingState(lesson: LessonSlot, date = new Date()) {
  if (lesson.date) {
    const todayKey = dateKeyFromDate(date);
    if (lesson.date < todayKey) return "past";
    if (lesson.date > todayKey) return "future";
  }

  const today = currentDayIndex(date);
  if (!lesson.date && lesson.dayIndex < today) return "past";
  if (!lesson.date && lesson.dayIndex > today) return "future";

  const now = nowMinutes(date);
  if (now >= minutesFromTime(lesson.end)) return "past";
  if (now >= minutesFromTime(lesson.start)) return "current";
  return "future";
}

export function selectDayLessons(lessons: LessonSlot[], dayIndex: number, weekMode: WeekMode, date = new Date()) {
  const targetDate = dateKeyFromDate(date);
  return lessons
    .filter((lesson) => {
      if (!lessonAppliesToWeek(lesson, weekMode)) return false;
      if (lesson.date) return lesson.date === targetDate;
      return lesson.dayIndex === dayIndex;
    })
    .sort((a, b) => a.start.localeCompare(b.start) || a.subject.localeCompare(b.subject, "ru"));
}

export function findCurrentAndNext(lessons: LessonSlot[], weekMode: WeekMode, date = new Date()) {
  const todayLessons = selectDayLessons(lessons, currentDayIndex(date), weekMode, date);
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
