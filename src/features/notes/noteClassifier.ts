import type { LessonSlot, WeekMode } from "../../types";
import type { NoteClassification, NoteKind, SubjectOption } from "./noteTypes";

const WEEKDAY_INDEX: Record<string, number> = {
  понедельник: 1,
  понедельнику: 1,
  вторник: 2,
  вторнику: 2,
  среда: 3,
  среду: 3,
  четверг: 4,
  четвергу: 4,
  пятница: 5,
  пятницу: 5,
  суббота: 6,
  субботу: 6,
  воскресенье: 7,
  воскресенью: 7
};

const KIND_LABELS: Record<NoteKind, string> = {
  note: "Запись",
  task: "Дело",
  homework: "ДЗ",
  wish: "Хотелка",
  idea: "Идея"
};

const SUBJECT_STOP_WORDS = new Set(["и", "в", "по", "для", "основы", "теория", "практика", "общий", "специальный"]);

export function noteKindLabel(kind: NoteKind) {
  return KIND_LABELS[kind];
}

export function normalizeNoteText(value: string) {
  return value
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9#]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeSubjectKey(subject: string) {
  return normalizeNoteText(subject.replace(/\([^)]*\)/g, " "))
    .replace(/#/g, "")
    .split(" ")
    .filter(Boolean)
    .join("-")
    .slice(0, 96);
}

export function lessonSubjectKeys(lesson: LessonSlot) {
  const subjects = lesson.variants?.length
    ? lesson.variants.map((variant) => variant.subject)
    : [lesson.subject];
  return [...new Set(subjects.map(normalizeSubjectKey).filter(Boolean))];
}

function lessonHasSubjectKey(lesson: LessonSlot, subjectKey: string) {
  return lessonSubjectKeys(lesson).includes(subjectKey);
}

function subjectAliases(label: string) {
  const normalized = normalizeNoteText(label);
  const words = normalized.split(" ").filter((word) => word.length > 2 && !SUBJECT_STOP_WORDS.has(word));
  const aliases = new Set<string>([normalized, normalizeNoteText(label.replace(/\([^)]*\)/g, " "))]);

  words.forEach((word) => {
    if (word.length >= 5) aliases.add(word);
  });
  if (words.length > 1) aliases.add(words.map((word) => word[0]).join(""));

  if (/баз.*данн|данн.*баз/.test(normalized)) ["бд", "базы", "база данных"].forEach((alias) => aliases.add(alias));
  if (/иностран.*язык|англ/.test(normalized)) ["англ", "английский", "иностранный"].forEach((alias) => aliases.add(alias));
  if (/алгоритм|программирован/.test(normalized)) ["алгоритмы", "ап", "программирование"].forEach((alias) => aliases.add(alias));
  if (/правовед/.test(normalized)) ["право", "правоведение"].forEach((alias) => aliases.add(alias));
  if (/физическ.*культур/.test(normalized)) ["физра", "физкультура"].forEach((alias) => aliases.add(alias));
  if (/теория.*систем|системн.*анализ/.test(normalized)) ["тса", "теория систем", "системный анализ"].forEach((alias) => aliases.add(alias));

  return [...aliases].filter((alias) => alias.length > 1).sort((a, b) => b.length - a.length);
}

function startOfWeek(date: Date) {
  const result = new Date(date);
  const day = result.getDay() || 7;
  result.setDate(result.getDate() - day + 1);
  result.setHours(0, 0, 0, 0);
  return result;
}

function weekModeForDate(date: Date, baseDate: Date, currentMode: WeekMode): WeekMode {
  if (currentMode === "all") return "all";
  const weekDelta = Math.round((startOfWeek(date).getTime() - startOfWeek(baseDate).getTime()) / 604_800_000);
  if (Math.abs(weekDelta) % 2 === 0) return currentMode;
  return currentMode === "numerator" ? "denominator" : "numerator";
}

function lessonDateTime(lesson: LessonSlot, date: Date) {
  const [hours, minutes] = lesson.start.split(":").map(Number);
  const value = new Date(date);
  value.setHours(hours, minutes, 0, 0);
  return value;
}

function nextLessonAt(subjectKey: string, lessons: LessonSlot[], weekMode: WeekMode, now: Date) {
  const dated = lessons
    .filter((lesson) => lesson.date && lessonHasSubjectKey(lesson, subjectKey))
    .map((lesson) => lessonDateTime(lesson, new Date(`${lesson.date}T00:00:00`)))
    .filter((date) => date.getTime() > now.getTime())
    .sort((a, b) => a.getTime() - b.getTime());
  if (dated.length) return dated[0].toISOString();

  for (let offset = 0; offset < 28; offset += 1) {
    const date = new Date(now);
    date.setDate(now.getDate() + offset);
    const dayIndex = date.getDay() || 7;
    const activeMode = weekModeForDate(date, now, weekMode);
    const candidates = lessons
      .filter((lesson) => !lesson.date)
      .filter((lesson) => lesson.dayIndex === dayIndex)
      .filter((lesson) => lessonHasSubjectKey(lesson, subjectKey))
      .filter((lesson) => lesson.weekMode === "all" || lesson.weekMode === activeMode)
      .map((lesson) => lessonDateTime(lesson, date))
      .filter((candidate) => candidate.getTime() > now.getTime())
      .sort((a, b) => a.getTime() - b.getTime());
    if (candidates.length) return candidates[0].toISOString();
  }

  return undefined;
}

export function buildSubjectOptions(lessons: LessonSlot[], weekMode: WeekMode, now = new Date()): SubjectOption[] {
  const subjects = new Map<string, string>();
  lessons.forEach((lesson) => {
    const labels = lesson.variants?.length
      ? lesson.variants.map((variant) => variant.subject)
      : [lesson.subject];
    labels.forEach((label) => {
      const key = normalizeSubjectKey(label);
      if (key && !subjects.has(key)) subjects.set(key, label);
    });
  });

  return [...subjects.entries()]
    .map(([key, label]) => ({ key, label, aliases: subjectAliases(label), nextAt: nextLessonAt(key, lessons, weekMode, now) }))
    .sort((a, b) => a.label.localeCompare(b.label, "ru"));
}

function matchesAlias(text: string, alias: string) {
  if (alias.length <= 3) return ` ${text} `.includes(` ${alias} `);
  return text.includes(alias);
}

function matchSubject(text: string, subjects: SubjectOption[]) {
  return subjects
    .flatMap((subject) => subject.aliases.map((alias) => ({ subject, alias })))
    .sort((a, b) => b.alias.length - a.alias.length)
    .find(({ alias }) => matchesAlias(text, alias))?.subject;
}

function inferKind(text: string): NoteKind {
  if (/(^|\s)(дз|домашк|лаборатор|лаба|лабу|курсов|реферат|задани|семинар|контрольн)/.test(text) || /к следующей паре/.test(text)) return "homework";
  if (/(^|\s)(хочу|мечта|когда нибудь|было бы круто|присмотреть)/.test(text)) return "wish";
  if (/(^|\s)(идея|придумал|концепт|можно сделать|предлагаю)/.test(text)) return "idea";
  if (/(^|\s)(сделать|купить|позвонить|написать|спросить|записаться|не забыть|надо|нужно|забрать|отправить)/.test(text)) return "task";
  return "note";
}

export function explicitPersonalSpace(text: string) {
  const normalized = normalizeNoteText(text);
  if (/(танц|хореограф|репетиц|связк|постановк)/.test(normalized)) return "Танцы";
  if (/(радио|эфир|джингл|трек|плейлист|подкаст|студийн.*микрофон)/.test(normalized)) return "Радио";
  return undefined;
}

function capitalize(value: string) {
  return value ? value[0].toLocaleUpperCase("ru-RU") + value.slice(1) : value;
}

function inferSpace(text: string, kind: NoteKind, hasSubject: boolean, spaces: string[]) {
  const explicitTag = text.match(/(?:^|\s)#([a-zа-я][a-zа-я0-9_-]{1,28})/i)?.[1];
  if (explicitTag) return capitalize(explicitTag.replace(/[_-]/g, " "));
  const personalSpace = explicitPersonalSpace(text);
  if (personalSpace) return personalSpace;
  const mentionedSpace = spaces
    .map((space) => ({ space, normalized: normalizeNoteText(space) }))
    .filter(({ normalized }) => normalized.length > 2 && normalized !== "входящие")
    .sort((a, b) => b.normalized.length - a.normalized.length)
    .find(({ normalized }) => ` ${text} `.includes(` ${normalized} `));
  if (mentionedSpace) return mentionedSpace.space;
  if (hasSubject || /(учеб|универ|влгу|пара|препод|экзамен|зачет)/.test(text)) return "Учёба";
  if (/(проект|репозитор|релиз|дизайн|разработ|приложени|фича|бэклог)/.test(text)) return "Проект";
  if (/(купить|заказать|магазин|доставка)/.test(text)) return "Покупки";
  if (kind === "wish") return "Хотелки";
  if (kind === "idea") return "Идеи";
  if (kind === "task") return "Дела";
  return "Входящие";
}

function formatDue(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

function parseDue(text: string, subject?: SubjectOption): Pick<NoteClassification, "dueAt" | "dueLabel"> {
  const now = new Date();
  let due: Date | undefined;

  if (/к следующей паре/.test(text) && subject?.nextAt) {
    due = new Date(subject.nextAt);
  } else if (/\bсегодня\b/.test(text)) {
    due = new Date(now);
    due.setHours(21, 0, 0, 0);
  } else if (/\bпослезавтра\b/.test(text)) {
    due = new Date(now);
    due.setDate(due.getDate() + 2);
    due.setHours(21, 0, 0, 0);
  } else if (/\bзавтра\b/.test(text)) {
    due = new Date(now);
    due.setDate(due.getDate() + 1);
    due.setHours(21, 0, 0, 0);
  } else {
    const dateMatch = text.match(/\b([0-3]?\d)[./]([01]?\d)(?:[./](\d{2,4}))?\b/);
    if (dateMatch) {
      const year = dateMatch[3] ? Number(dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3]) : now.getFullYear();
      due = new Date(year, Number(dateMatch[2]) - 1, Number(dateMatch[1]), 21, 0, 0, 0);
      if (due.getTime() < now.getTime() && !dateMatch[3]) due.setFullYear(due.getFullYear() + 1);
    } else {
      const weekday = Object.entries(WEEKDAY_INDEX).find(([word]) => text.includes(word));
      if (weekday) {
        due = new Date(now);
        const current = due.getDay() || 7;
        let delta = Number(weekday[1]) - current;
        if (delta <= 0) delta += 7;
        due.setDate(due.getDate() + delta);
        due.setHours(21, 0, 0, 0);
      }
    }
  }

  if (!due) return {};
  return { dueAt: due.toISOString(), dueLabel: /к следующей паре/.test(text) ? `К следующей паре · ${formatDue(due)}` : `До ${formatDue(due)}` };
}

export function noteTitle(text: string) {
  const firstLine = text.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "Новая запись";
  return firstLine.length > 88 ? `${firstLine.slice(0, 85).trimEnd()}...` : firstLine;
}

export function classifyNote(text: string, subjects: SubjectOption[], spaces: string[] = []): NoteClassification {
  const normalized = normalizeNoteText(text);
  const dueText = text.toLocaleLowerCase("ru-RU").replace(/ё/g, "е").replace(/\s+/g, " ").trim();
  const personalSpace = explicitPersonalSpace(normalized);
  const subject = personalSpace ? undefined : matchSubject(normalized, subjects);
  const kind = inferKind(normalized);
  const space = personalSpace ?? inferSpace(normalized, kind, Boolean(subject), spaces);
  const due = parseDue(dueText, subject);
  const signals = [subject, kind !== "note", space !== "Входящие", due.dueAt].filter(Boolean).length;

  return {
    kind,
    space,
    confidence: Math.min(0.96, 0.46 + signals * 0.12),
    subjectKey: subject?.key,
    subjectLabel: subject?.label,
    ...due
  };
}
