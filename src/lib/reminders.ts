import type { LessonSlot, ReminderSettings, WeekMode } from "../types";
import { currentDayIndex, minutesFromTime, nowMinutes, selectDayLessons } from "./time";

const REMINDER_TIMER_KEY = "pi124.reminder.timer";

export async function requestNotificationPermission() {
  if (typeof Notification === "undefined") return "unsupported" as const;
  if (Notification.permission !== "default") return Notification.permission;
  return Notification.requestPermission();
}

export function canUseNotifications(settings: ReminderSettings) {
  return settings.enabled && settings.permission === "granted" && "serviceWorker" in navigator;
}

export function scheduleNextReminder(
  lessons: LessonSlot[],
  weekMode: WeekMode,
  settings: ReminderSettings,
  onScheduled?: (message: string) => void
) {
  const previous = Number(window.sessionStorage.getItem(REMINDER_TIMER_KEY));
  if (previous) window.clearTimeout(previous);

  if (!canUseNotifications(settings)) return;

  const today = selectDayLessons(lessons, currentDayIndex(), weekMode);
  const target = today.find((lesson) => minutesFromTime(lesson.start) - settings.minutesBefore > nowMinutes());
  if (!target) {
    onScheduled?.("На сегодня напоминаний больше нет");
    return;
  }

  const delayMs = (minutesFromTime(target.start) - settings.minutesBefore - nowMinutes()) * 60 * 1000;
  const timer = window.setTimeout(() => {
    navigator.serviceWorker.ready.then((registration) => {
      if (registration.active) {
        registration.active.postMessage({
          type: "schedule-notification",
          payload: {
            title: `Через ${settings.minutesBefore} мин: ${target.subject}`,
            body: `${target.start}-${target.end}${target.room ? `, ${target.room}` : ""}`,
            tag: `pi124-${target.id}`
          }
        });
      } else {
        registration.showNotification(`Через ${settings.minutesBefore} мин: ${target.subject}`, {
          body: `${target.start}-${target.end}${target.room ? `, ${target.room}` : ""}`,
          tag: `pi124-${target.id}`,
          icon: "/icons/icon.svg"
        });
      }
    });
  }, Math.max(0, delayMs));

  window.sessionStorage.setItem(REMINDER_TIMER_KEY, String(timer));
  onScheduled?.(`Следующее напоминание: ${target.start}, ${target.subject}`);
}
