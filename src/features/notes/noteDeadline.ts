import type { NoteClassification } from "./noteTypes";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function toLocalDateTimeValue(iso?: string) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function localDateTimeToIso(value: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function formatDueLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  const formatted = new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
  return `До ${formatted}`;
}

export function resolveNoteDeadline(classification: NoteClassification, override?: string | null) {
  if (override === undefined) {
    return {
      dueAt: classification.dueAt,
      dueLabel: classification.dueLabel,
      dueManual: false
    };
  }
  if (override === null) return { dueAt: undefined, dueLabel: undefined, dueManual: true };
  const date = new Date(override);
  const dueAt = Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  return {
    dueAt,
    dueLabel: dueAt ? formatDueLabel(dueAt) : undefined,
    dueManual: true
  };
}

export function deadlineForCalendarDate(date: Date, now = new Date()) {
  const target = new Date(date);
  const sameDay = target.getFullYear() === now.getFullYear()
    && target.getMonth() === now.getMonth()
    && target.getDate() === now.getDate();

  if (!sameDay) {
    target.setHours(18, 0, 0, 0);
    return target.toISOString();
  }

  const nextSlot = new Date(now);
  nextSlot.setSeconds(0, 0);
  nextSlot.setMinutes(Math.ceil((nextSlot.getMinutes() + 1) / 30) * 30);
  if (nextSlot.getDate() !== now.getDate()) target.setHours(23, 59, 0, 0);
  else target.setTime(nextSlot.getTime());
  return target.toISOString();
}
