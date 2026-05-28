import type { CurrentInfo, LessonSlot, ScheduleState, WeekMode } from "../types";
import { writeScheduleCache } from "./storage";

const API_BASE = "/vlsu-api";
const INSTITUTE_NAME = "Институт информационных технологий и электроники";
const GROUP_NAME = "ПИ-124";
const FALLBACK_NREC = "7936a2a43b11b20b01d30f5b00c73166";

const PAIR_TIMES = [
  ["08:30", "10:00"],
  ["10:20", "11:50"],
  ["12:10", "13:40"],
  ["14:00", "15:30"],
  ["15:50", "17:20"],
  ["17:40", "19:10"],
  ["19:20", "20:50"]
] as const;

interface InstituteDto {
  Value: string;
  Text: string;
}

interface GroupDto {
  Nrec: string;
  Name: string;
  Course: string;
}

interface GroupsResponse {
  value?: GroupDto[];
  Count?: number;
}

interface ScheduleDayDto {
  type: string;
  name: string;
  [key: `n${number}`]: string;
  [key: `z${number}`]: string;
}

interface CurrentInfoDto {
  CurrentLesson: string;
  CurrentWeekType: 1 | 2;
  Name: string;
  CurrentSemester: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    throw new Error(`VLSU API ${path} failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function resolveGroupNrec() {
  try {
    const institutes = await request<InstituteDto[]>("/catalogs/GetInstitutes");
    const institute = institutes.find((item) => item.Text === INSTITUTE_NAME);
    if (!institute) return FALLBACK_NREC;

    const groups = await request<GroupDto[] | GroupsResponse>("/student/GetStudGroups", {
      method: "POST",
      body: JSON.stringify({ Institut: institute.Value, WFormed: 0 })
    });

    const list = Array.isArray(groups) ? groups : groups.value ?? [];
    return list.find((group) => group.Name === GROUP_NAME && group.Course === "2 курс")?.Nrec ?? FALLBACK_NREC;
  } catch {
    return FALLBACK_NREC;
  }
}

async function fetchCurrentInfo(nrec: string): Promise<CurrentInfo> {
  const dto = await request<CurrentInfoDto>("/student/GetGroupCurrentInfo", {
    method: "POST",
    body: JSON.stringify(nrec)
  });

  return {
    currentLesson: dto.CurrentLesson,
    currentWeekType: dto.CurrentWeekType,
    name: dto.Name,
    semester: dto.CurrentSemester
  };
}

function normalizeWeekMode(mode: "n" | "z"): WeekMode {
  return mode === "n" ? "numerator" : "denominator";
}

function parseLessonText(rawText: string) {
  const parts = rawText.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 4) {
    return {
      room: parts[0],
      kind: parts[1],
      teacher: parts[2],
      subject: parts.slice(3).join(", ")
    };
  }

  if (parts.length === 3) {
    return {
      room: parts[0],
      kind: parts[1],
      subject: parts[2]
    };
  }

  return { subject: rawText.trim() };
}

function createLesson(day: ScheduleDayDto, dayIndex: number, pairIndex: number, rawText: string, weekMode: WeekMode): LessonSlot {
  const [start, end] = PAIR_TIMES[pairIndex - 1];
  const parsed = parseLessonText(rawText);
  return {
    id: `${dayIndex}-${pairIndex}-${weekMode}-${rawText}`,
    dayIndex,
    dayName: day.name,
    pairIndex,
    start,
    end,
    rawText,
    weekMode,
    ...parsed
  };
}

function normalizeSchedule(days: ScheduleDayDto[]): LessonSlot[] {
  const lessons: LessonSlot[] = [];

  days.forEach((day, index) => {
    PAIR_TIMES.forEach((_, pairOffset) => {
      const pairIndex = pairOffset + 1;
      const numerator = (day[`n${pairIndex}`] || "").trim();
      const denominator = (day[`z${pairIndex}`] || "").trim();

      if (!numerator && !denominator) return;

      if (numerator && denominator && numerator === denominator) {
        lessons.push(createLesson(day, index + 1, pairIndex, numerator, "all"));
        return;
      }

      if (numerator) lessons.push(createLesson(day, index + 1, pairIndex, numerator, normalizeWeekMode("n")));
      if (denominator) lessons.push(createLesson(day, index + 1, pairIndex, denominator, normalizeWeekMode("z")));
    });
  });

  return lessons;
}

async function fetchSchedule(nrec: string) {
  const days = await request<ScheduleDayDto[]>("/student/GetGroupSchedule", {
    method: "POST",
    body: JSON.stringify({ Nrec: nrec, WeekType: 0, WeekDays: "1,2,3,4,5,6" })
  });

  return normalizeSchedule(days);
}

export async function loadSchedule(): Promise<ScheduleState> {
  const groupNrec = await resolveGroupNrec();
  const [currentInfo, allLessons] = await Promise.all([fetchCurrentInfo(groupNrec), fetchSchedule(groupNrec)]);
  const state = {
    groupNrec,
    currentInfo,
    allLessons,
    fetchedAt: new Date().toISOString()
  };
  writeScheduleCache(state);
  return state;
}

export function activeWeekMode(currentWeekType: 1 | 2): WeekMode {
  return currentWeekType === 1 ? "numerator" : "denominator";
}

export function lessonAppliesToWeek(lesson: LessonSlot, weekMode: WeekMode) {
  return lesson.weekMode === "all" || lesson.weekMode === weekMode;
}

export { PAIR_TIMES, GROUP_NAME, INSTITUTE_NAME };
