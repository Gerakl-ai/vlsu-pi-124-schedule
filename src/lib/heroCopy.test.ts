import { describe, expect, it } from "vitest";

import { heroCopy, heroCopyStrings, type HeroCopyInput, type HeroMode } from "./heroCopy";

const formatDuration = (minutes: number) => `${minutes} мин`;

function input(overrides: Partial<HeroCopyInput> = {}): HeroCopyInput {
  return {
    mode: "done",
    isSelectedToday: true,
    lessonProgress: 0,
    minutesToNext: 25,
    minutesRemaining: 18,
    nextStart: "08:30",
    completedCount: 2,
    lessonCount: 2,
    nextStudyDayLabel: "Понедельник, 08:30",
    hasLoadedLessons: true,
    formatDuration,
    ...overrides
  };
}

/** Слова, по которым ловится пересказ одного и того же состояния. */
function repeatedWords(strings: string[]) {
  const seen = new Map<string, number>();
  for (const value of strings) {
    for (const word of value.toLowerCase().match(/[\wа-яё]+/gi) ?? []) {
      if (word.length < 4) continue;
      seen.set(word, (seen.get(word) ?? 0) + 1);
    }
  }
  return [...seen.entries()].filter(([, count]) => count > 1).map(([word]) => word);
}

describe("карточка дня не повторяет один факт", () => {
  const cases: Array<[HeroMode, string]> = [
    ["current", "Базы данных"],
    ["next", "Основы backend разработки"],
    ["done", "Все пары пройдены"],
    ["free", "Сегодня без пар"],
    ["loading", "Загрузка расписания"]
  ];

  for (const [mode, heading] of cases) {
    it(`режим ${mode}: ни одна строка не пересказывает другую`, () => {
      const strings = heroCopyStrings(heroCopy(input({ mode })), heading);
      expect(repeatedWords(strings)).toEqual([]);
    });
  }
});

describe("закрытый день", () => {
  it("говорит о завершении один раз, а не тремя формулировками", () => {
    // Было: сигил «Готово 2/2», плашка «День закрыт», заголовок «Все пары
    // пройдены» и строка прогресса «День закрыт» — четыре штуки об одном.
    const copy = heroCopy(input({ mode: "done" }));
    expect(copy.sigilValue).toBe("2/2");
    expect(copy.status).toBeUndefined();
    expect(copy.showProgressRow).toBe(false);
  });
});

describe("идущая пара", () => {
  it("единственный режим с отметкой «в эфире»", () => {
    const copy = heroCopy(input({ mode: "current", lessonProgress: 65 }));
    expect(copy.status).toEqual({ copy: "Пара идёт", live: true });
    expect(copy.sigilLabel).toBe("Прошло");
    expect(copy.sigilValue).toBe("65%");
    expect(copy.progressTitle).toBe("18 мин осталось");
  });

  it("не показывает точку «в эфире» в остальных режимах", () => {
    for (const mode of ["next", "done", "free", "loading"] as HeroMode[]) {
      expect(heroCopy(input({ mode })).status?.live ?? false).toBe(false);
    }
  });
});

describe("следующая пара", () => {
  it("сегодня показывает, сколько ждать, и отдельно время начала", () => {
    const copy = heroCopy(input({ mode: "next", isSelectedToday: true, minutesToNext: 25 }));
    expect(copy.sigilValue).toBe("25 мин");
    expect(copy.progressTitle).toBe("Начало в 08:30");
  });

  it("для другого дня показывает только время: «сколько ждать» там бессмысленно", () => {
    const copy = heroCopy(input({ mode: "next", isSelectedToday: false }));
    expect(copy.sigilValue).toBe("08:30");
    expect(copy.showProgressRow).toBe(false);
  });

  it("не обещает строку прогресса, когда времени начала нет", () => {
    const copy = heroCopy(input({ mode: "next", isSelectedToday: true, nextStart: undefined }));
    expect(copy.showProgressRow).toBe(false);
  });
});

describe("свободный день", () => {
  it("говорит только то, что полезно: когда следующий учебный день", () => {
    const copy = heroCopy(input({ mode: "free" }));
    expect(copy.progressTitle).toBe("Дальше: Понедельник, 08:30");
  });

  it("молчит, когда следующий день неизвестен", () => {
    const copy = heroCopy(input({ mode: "free", nextStudyDayLabel: undefined }));
    expect(copy.showProgressRow).toBe(false);
    expect(copy.progressTitle).toBeUndefined();
  });
});

describe("загрузка", () => {
  it("различает ожидание ВлГУ и готовые данные", () => {
    expect(heroCopy(input({ mode: "loading", hasLoadedLessons: false })).status?.copy).toBe("Ждём ВлГУ");
    expect(heroCopy(input({ mode: "loading", hasLoadedLessons: true })).status?.copy).toBe("Данные готовы");
  });
});
