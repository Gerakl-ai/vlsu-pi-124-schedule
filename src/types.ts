export type WeekMode = "all" | "numerator" | "denominator";

export type AppTab = "today" | "week" | "settings";

export type ApiStatus = "idle" | "loading" | "ready" | "stale" | "error";

export interface LessonSlot {
  id: string;
  dayIndex: number;
  dayName: string;
  pairIndex: number;
  start: string;
  end: string;
  subject: string;
  room?: string;
  kind?: string;
  teacher?: string;
  rawText: string;
  weekMode: WeekMode;
  isCurrent?: boolean;
  isNext?: boolean;
}

export interface CurrentInfo {
  currentLesson: string;
  currentWeekType: 1 | 2;
  name: string;
  semester: number;
}

export interface ScheduleState {
  groupNrec: string;
  currentInfo: CurrentInfo;
  allLessons: LessonSlot[];
  fetchedAt: string;
}

export interface ReminderSettings {
  enabled: boolean;
  minutesBefore: number;
  permission: NotificationPermission | "unsupported";
}
