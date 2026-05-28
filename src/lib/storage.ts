import type { ReminderSettings, ScheduleState } from "../types";

const SCHEDULE_CACHE_KEY = "pi124.schedule.cache";
const REMINDER_KEY = "pi124.reminder.settings";

export function readScheduleCache(): ScheduleState | null {
  try {
    const raw = localStorage.getItem(SCHEDULE_CACHE_KEY);
    return raw ? (JSON.parse(raw) as ScheduleState) : null;
  } catch {
    return null;
  }
}

export function writeScheduleCache(state: ScheduleState) {
  localStorage.setItem(SCHEDULE_CACHE_KEY, JSON.stringify(state));
}

export function readReminderSettings(): ReminderSettings {
  const permission = typeof Notification === "undefined" ? "unsupported" : Notification.permission;
  try {
    const raw = localStorage.getItem(REMINDER_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<ReminderSettings>) : {};
    return {
      enabled: Boolean(parsed.enabled),
      minutesBefore: parsed.minutesBefore ?? 10,
      permission
    };
  } catch {
    return { enabled: false, minutesBefore: 10, permission };
  }
}

export function writeReminderSettings(settings: ReminderSettings) {
  localStorage.setItem(REMINDER_KEY, JSON.stringify(settings));
}
