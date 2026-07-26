import { describe, expect, it } from "vitest";
import type { LessonSlot } from "../../types";
import {
  buildSubjectOptions,
  classifyNote,
  hasExplicitStudyContext,
  inferNoteTopic,
  lessonSubjectKeys,
  normalizeSubjectKey
} from "./noteClassifier";

const subgroupLesson: LessonSlot = {
  id: "friday-1",
  dayIndex: 5,
  dayName: "Пятница",
  pairIndex: 1,
  start: "08:30",
  end: "10:00",
  subject: "Основы frontend разработки / Алгоритмизация и программирование",
  room: "109-3 / 111-3",
  kind: "лб",
  teacher: "Аджамиех С.М. / Старовойтов Е.А.",
  rawText: "subgroups",
  weekMode: "all",
  variants: [
    { subject: "Основы frontend разработки", room: "109-3", kind: "лб", teacher: "Аджамиех С.М.", rawText: "frontend" },
    { subject: "Алгоритмизация и программирование", room: "111-3", kind: "лб", teacher: "Старовойтов Е.А.", rawText: "algorithms" }
  ]
};

const databaseLesson: LessonSlot = {
  id: "tuesday-3",
  dayIndex: 2,
  dayName: "Вторник",
  pairIndex: 3,
  start: "12:10",
  end: "13:40",
  subject: "Базы данных",
  room: "407-2",
  kind: "лб",
  teacher: "Преподаватель",
  rawText: "database",
  weekMode: "all"
};

describe("subgroup subject context", () => {
  it("exposes every subgroup subject as an independent key", () => {
    expect(lessonSubjectKeys(subgroupLesson)).toEqual([
      normalizeSubjectKey("Основы frontend разработки"),
      normalizeSubjectKey("Алгоритмизация и программирование")
    ]);
  });

  it("builds independent subject choices for smart notes", () => {
    const subjects = buildSubjectOptions([subgroupLesson], "numerator", new Date("2026-07-13T07:00:00"));
    expect(subjects.map((subject) => subject.label)).toEqual([
      "Алгоритмизация и программирование",
      "Основы frontend разработки"
    ]);
  });
});

describe("smart note activity and subject classification", () => {
  const subjects = buildSubjectOptions(
    [subgroupLesson, databaseLesson],
    "numerator",
    new Date("2026-07-13T07:00:00")
  );
  const spaces = ["Входящие", "Учёба", "Дела", "Работа", "Танцы", "Радио", "Проект"];

  it.each([
    "Смонтировать интервью для клиента к пятнице",
    "Подготовить монтаж интервью про алгоритмизацию и программирование",
    "Внести правки в ролик для заказчика"
  ])("keeps a work note detached from university subjects: %s", (text) => {
    expect(classifyNote(text, subjects, spaces)).toMatchObject({
      kind: "task",
      space: "Работа",
      subjectKey: undefined,
      subjectLabel: undefined
    });
  });

  it.each([
    ["По проге сделать практическое задание", "Алгоритмизация и программирование"],
    ["Сделать лабораторную по БД", "Базы данных"],
    ["По базам данных закончить задание", "Базы данных"]
  ])("attaches a subject only to an explicit study reference: %s", (text, subjectLabel) => {
    expect(classifyNote(text, subjects, spaces)).toMatchObject({
      space: "Учёба",
      subjectLabel
    });
  });

  it("recognizes general study context without inventing a subject", () => {
    const result = classifyNote("Подготовиться к экзамену", subjects, spaces);
    expect(result.space).toBe("Учёба");
    expect(result.subjectKey).toBeUndefined();
  });

  it("leaves an unrelated short note in the inbox", () => {
    expect(classifyNote("Баня", subjects, spaces)).toMatchObject({
      kind: "note",
      space: "Входящие",
      topic: "Баня",
      subjectKey: undefined
    });
  });

  it.each([
    ["Сходить вечером в баню", "Баня"],
    ["Доделать сайт портфолио до пятницы", "Сайт портфолио"],
    ["Смонтировать интервью для клиента", "Монтаж интервью"],
    ["По дуэту: начало Ксюша с пола", "Дуэт"]
  ])("infers a concise contextual topic: %s", (text, topic) => {
    expect(inferNoteTopic(text)).toBe(topic);
  });

  it("routes a duet to dance while keeping its precise topic", () => {
    expect(classifyNote("По дуэту: начало Ксюша с пола", subjects, spaces)).toMatchObject({
      space: "Танцы",
      topic: "Дуэт",
      subjectKey: undefined
    });
  });

  it("uses the explicit university subject as the exact topic", () => {
    expect(classifyNote("По БД сделать лабораторную", subjects, spaces)).toMatchObject({
      space: "Учёба",
      topic: "Базы данных",
      subjectLabel: "Базы данных"
    });
  });

  it("does not treat a professional topic as study context", () => {
    expect(hasExplicitStudyContext("Интервью про программирование", subjects)).toBe(false);
  });
});
