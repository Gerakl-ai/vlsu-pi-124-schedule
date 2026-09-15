import type { CurrentInfo, LessonSlot, LessonVariant, ScheduleState, WeekMode } from "../types";
import { writeScheduleCache } from "./storage";

const API_BASE = "/vlsu-api";
const INSTITUTE_NAME = "Институт информационных технологий и электроники";
const GROUP_NAME = "ПИ-124";
const FALLBACK_NREC = "7936a2a43b11b20b01d30f5b00c73166";
const REQUEST_TIMEOUT_MS = 8_000;
const REQUEST_RETRIES = 0;

const PAIR_TIMES = [
  ["08:30", "10:00"],
  ["10:20", "11:50"],
  ["12:10", "13:40"],
  ["14:00", "15:30"],
  ["15:50", "17:20"],
  ["17:40", "19:10"],
  ["19:20", "20:50"]
] as const;

const DAY_INDEX_BY_NAME: Record<string, number> = {
  "понедельник": 1,
  "вторник": 2,
  "среда": 3,
  "четверг": 4,
  "пятница": 5,
  "суббота": 6,
  "воскресенье": 7
};

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

export interface ScheduleDayDto {
  type: string;
  name: string;
  [key: `n${number}`]: string;
  [key: `z${number}`]: string;
}

export interface ExamSessionDto {
  type: "ExamSession";
  date: string;
  time: string;
  isConsultation: boolean;
  name: string;
}

interface CurrentInfoDto {
  CurrentLesson: string;
  CurrentWeekType: 1 | 2;
  Name: string;
  CurrentSemester: number;
}

interface ParsedLesson {
  subject: string;
  room?: string;
  kind?: string;
  teacher?: string;
  variants: LessonVariant[];
}

interface RequestMetadata {
  snapshotAt?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isScheduleDay(value: unknown): value is ScheduleDayDto {
  return isRecord(value) && value.type === "Lessons" && typeof value.name === "string";
}

function isExamSession(value: unknown): value is ExamSessionDto {
  return isRecord(value)
    && value.type === "ExamSession"
    && typeof value.date === "string"
    && typeof value.time === "string"
    && typeof value.name === "string"
    && typeof value.isConsultation === "boolean";
}

class ApiResponseError extends Error {
  constructor(path: string, readonly status: number) {
    super(`VLSU API ${path} failed with ${status}`);
  }
}

function wait(milliseconds: number) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

export function decodeApiPayload(payload: unknown) {
  if (typeof payload !== "string") return payload;
  const trimmed = payload.trim();
  if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) return payload;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return payload;
  }
}

async function request<T>(path: string, init?: RequestInit, metadata?: RequestMetadata): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= REQUEST_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const abortFromParent = () => controller.abort(init?.signal?.reason);
    init?.signal?.addEventListener("abort", abortFromParent, { once: true });
    const timeout = globalThis.setTimeout(() => controller.abort("timeout"), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${API_BASE}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(init?.headers ?? {})
        }
      });

      if (!response.ok) throw new ApiResponseError(path, response.status);
      const snapshotAt = response.headers.get("X-Lad-Snapshot-At")
        ?? response.headers.get("Date")
        ?? new Date().toISOString();
      if (metadata && !Number.isNaN(new Date(snapshotAt).getTime())) {
        metadata.snapshotAt = snapshotAt;
      }
      return decodeApiPayload(await response.json()) as T;
    } catch (error) {
      lastError = error;
      if (init?.signal?.aborted) throw error;
      if (error instanceof ApiResponseError && !isRetryableStatus(error.status)) throw error;
      if (attempt === REQUEST_RETRIES) throw error;
      await wait(300 * (attempt + 1));
    } finally {
      globalThis.clearTimeout(timeout);
      init?.signal?.removeEventListener("abort", abortFromParent);
    }
  }

  throw lastError;
}

function unwrapArrayPayload<T>(payload: unknown, label: string): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === "object" && "value" in payload && Array.isArray(payload.value)) {
    return payload.value as T[];
  }
  throw new Error(`VLSU API returned an invalid ${label} payload`);
}

async function resolveGroupNrec(metadata?: RequestMetadata) {
  try {
    const institutes = unwrapArrayPayload<InstituteDto>(await request<unknown>("/catalogs/GetInstitutes", undefined, metadata), "institutes");
    const institute = institutes.find((item) => item.Text === INSTITUTE_NAME);
    if (!institute) return FALLBACK_NREC;

    const groups = await request<GroupDto[] | GroupsResponse>("/student/GetStudGroups", {
      method: "POST",
      body: JSON.stringify({ Institut: institute.Value, WFormed: 0 })
    }, metadata);

    const list = Array.isArray(groups) ? groups : groups.value ?? [];
    return list.find((group) => group.Name === GROUP_NAME && group.Course === "2 курс")?.Nrec ?? FALLBACK_NREC;
  } catch {
    return FALLBACK_NREC;
  }
}

async function fetchCurrentInfo(nrec: string, metadata?: RequestMetadata): Promise<CurrentInfo> {
  const payload = await request<unknown>("/student/GetGroupCurrentInfo", {
    method: "POST",
    body: JSON.stringify(nrec)
  }, metadata);
  if (!isRecord(payload)
    || typeof payload.CurrentLesson !== "string"
    || (payload.CurrentWeekType !== 1 && payload.CurrentWeekType !== 2)
    || typeof payload.Name !== "string"
    || typeof payload.CurrentSemester !== "number") {
    throw new Error("VLSU API returned invalid current group information");
  }
  const dto = payload as unknown as CurrentInfoDto;

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

function parseLessonVariant(rawText: string): LessonVariant {
  const normalized = rawText.replace(/\s+/g, " ").trim();
  const parts = normalized.split(",").map((part) => part.trim());

  if (parts.length >= 4) {
    const subject = parts.slice(3).filter(Boolean).join(", ");
    return {
      room: parts[0] || undefined,
      kind: parts[1] || undefined,
      teacher: parts[2] || undefined,
      subject: subject || normalized,
      rawText: normalized
    };
  }

  if (parts.length === 3) {
    return {
      room: parts[0] || undefined,
      kind: parts[1] || undefined,
      subject: parts[2] || normalized,
      rawText: normalized
    };
  }

  return { subject: normalized, rawText: normalized };
}

function uniqueValues(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

export function parseLessonText(rawText: string): ParsedLesson {
  const variants = rawText
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseLessonVariant);

  if (!variants.length) return { subject: "Занятие", variants: [] };

  const subjects = uniqueValues(variants.map((variant) => variant.subject));
  const rooms = uniqueValues(variants.map((variant) => variant.room));
  const kinds = uniqueValues(variants.map((variant) => variant.kind));
  const teachers = uniqueValues(variants.map((variant) => variant.teacher));

  return {
    subject: subjects.join(" / "),
    room: rooms.length ? rooms.join(" / ") : undefined,
    kind: kinds.length ? kinds.join(" / ") : undefined,
    teacher: teachers.length ? teachers.join(" / ") : undefined,
    variants
  };
}

function parseRuDate(value: string) {
  const [day, month, year] = value.split(".").map(Number);
  return new Date(year, month - 1, day);
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dayIndexFromDate(date: Date) {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

function dayIndexFromScheduleName(name: string, fallback: number) {
  return DAY_INDEX_BY_NAME[name.trim().toLocaleLowerCase("ru-RU")] ?? fallback;
}

function endTimeForStart(start: string) {
  const pair = PAIR_TIMES.find(([pairStart]) => pairStart === start);
  if (pair) return pair[1];

  const [hours, minutes] = start.split(":").map(Number);
  const date = new Date(2026, 0, 1, hours, minutes + 90);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
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
    scheduleKind: "classes",
    ...parsed
  };
}

function createExamLesson(session: ExamSessionDto, index: number): LessonSlot {
  const date = parseRuDate(session.date);
  const parsed = parseLessonText(session.name);
  const dateIso = dateKey(date);
  const dateLabel = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    weekday: "short"
  }).format(date);

  return {
    id: `exam-${dateIso}-${session.time}-${index}-${session.name}`,
    dayIndex: dayIndexFromDate(date),
    dayName: new Intl.DateTimeFormat("ru-RU", { weekday: "long" }).format(date),
    date: dateIso,
    dateLabel,
    scheduleKind: "exam",
    isConsultation: session.isConsultation,
    pairIndex: index + 1,
    start: session.time,
    end: endTimeForStart(session.time),
    rawText: session.name,
    weekMode: "all",
    ...parsed,
    kind: session.isConsultation ? "консультация" : parsed.kind
  };
}

function normalizeExamSchedule(sessions: ExamSessionDto[]): LessonSlot[] {
  return sessions
    .map(createExamLesson)
    .sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`, "ru"));
}

function isExamSchedule(days: Array<ScheduleDayDto | ExamSessionDto>): days is ExamSessionDto[] {
  return days.some((item) => item.type === "ExamSession");
}

export function normalizeSchedule(days: Array<ScheduleDayDto | ExamSessionDto>): LessonSlot[] {
  if (isExamSchedule(days)) return normalizeExamSchedule(days);

  const classDays = days as ScheduleDayDto[];
  const lessons: LessonSlot[] = [];

  classDays.forEach((day, index) => {
    const dayIndex = dayIndexFromScheduleName(day.name, index + 1);
    PAIR_TIMES.forEach((_, pairOffset) => {
      const pairIndex = pairOffset + 1;
      const numerator = (day[`n${pairIndex}`] || "").trim();
      const denominator = (day[`z${pairIndex}`] || "").trim();

      if (!numerator && !denominator) return;

      if (numerator && denominator && numerator === denominator) {
        lessons.push(createLesson(day, dayIndex, pairIndex, numerator, "all"));
        return;
      }

      if (numerator) lessons.push(createLesson(day, dayIndex, pairIndex, numerator, normalizeWeekMode("n")));
      if (denominator) lessons.push(createLesson(day, dayIndex, pairIndex, denominator, normalizeWeekMode("z")));
    });
  });

  return lessons;
}

export function normalizeCachedSchedule(state: ScheduleState): ScheduleState {
  return {
    ...state,
    weekTypeAsOf: state.weekTypeAsOf ?? state.fetchedAt,
    allLessons: state.allLessons.map((lesson) => ({
      ...lesson,
      ...parseLessonText(lesson.rawText)
    }))
  };
}

async function fetchSchedule(nrec: string, metadata?: RequestMetadata) {
  const payload = await request<unknown>("/student/GetGroupSchedule", {
    method: "POST",
    body: JSON.stringify({ Nrec: nrec, WeekType: 0, WeekDays: "1,2,3,4,5,6" })
  }, metadata);
  const days = unwrapArrayPayload<ScheduleDayDto | ExamSessionDto>(payload, "schedule");
  if (days.some((day) => !isScheduleDay(day) && !isExamSession(day))) {
    throw new Error("VLSU API returned an invalid schedule item");
  }

  return normalizeSchedule(days);
}

export async function loadSchedule(): Promise<ScheduleState> {
  const fetchState = async (groupNrec: string) => {
    const currentInfoMetadata: RequestMetadata = {};
    const scheduleMetadata: RequestMetadata = {};
    const [currentInfo, allLessons] = await Promise.all([
      fetchCurrentInfo(groupNrec, currentInfoMetadata),
      fetchSchedule(groupNrec, scheduleMetadata)
    ]);
    return { groupNrec, currentInfo, allLessons, currentInfoMetadata, scheduleMetadata };
  };

  let resolved;
  try {
    resolved = await fetchState(FALLBACK_NREC);
  } catch (initialError) {
    const discoveredNrec = await resolveGroupNrec();
    if (discoveredNrec === FALLBACK_NREC) throw initialError;
    resolved = await fetchState(discoveredNrec);
  }
  const { currentInfoMetadata, scheduleMetadata, ...scheduleState } = resolved;
  const now = new Date().toISOString();
  const state: ScheduleState = {
    ...scheduleState,
    fetchedAt: scheduleMetadata.snapshotAt ?? now,
    weekTypeAsOf: currentInfoMetadata.snapshotAt ?? now
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
