import type { ReminderSettings } from "../types";

const REMINDER_KEY = "lad.reminder.settings.v2";
const LEGACY_REMINDER_KEY = "pi124.reminder.settings";

export function readReminderSettings(): ReminderSettings {
  const permission = typeof Notification === "undefined" ? "unsupported" : Notification.permission;
  try {
    const raw = localStorage.getItem(REMINDER_KEY) ?? localStorage.getItem(LEGACY_REMINDER_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<ReminderSettings>) : {};
    if (raw && !localStorage.getItem(REMINDER_KEY)) localStorage.setItem(REMINDER_KEY, raw);
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
