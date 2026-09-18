import { beforeEach, describe, expect, it, vi } from "vitest";

import { normalizeSchedule } from "./scheduleApi";
import { vlsuWeekModeForDate, vlsuWeekTypeForDate } from "./academicWeek";
import {
  catalogGroups,
  catalogInstitutes,
  normalizeStaticCatalog,
  normalizeStaticSnapshot,
  resetStaticCatalogCache,
  scheduleStateFromSnapshot,
  staticDataUrl
} from "./staticData";

const HASH = "a".repeat(64);

const catalogPayload = {
  schemaVersion: 3,
  capturedAt: "2026-09-18T16:31:59.322Z",
  instituteCount: 1,
  groupCount: 3,
  institutes: [
    {
      id: "5b42fa53ec1dd1892e5ec44a3a60a896",
      name: "Институт информационных технологий и электроники",
      shortName: "ИИТЭ",
      groupCount: 3,
      groups: [
        { nrec: "7936a2a43b11b20b01d30f5b00c73166", name: "ПИ-124", course: "3 курс", forms: ["full-time"] },
        { nrec: "b".repeat(32), name: "ЗИС-123", course: "4 курс", forms: ["extramural"] },
        { nrec: "c".repeat(32), name: "ВИС-121", course: "5 курс", forms: ["part-time", "extramural"] }
      ]
    }
  ]
};

const snapshotPayload = {
  schemaVersion: 3,
  group: {
    nrec: "7936a2a43b11b20b01d30f5b00c73166",
    name: "ПИ-124",
    course: "3 курс",
    forms: ["full-time"],
    instituteId: "5b42fa53ec1dd1892e5ec44a3a60a896",
    instituteName: "Институт информационных технологий и электроники",
    instituteShortName: "ИИТЭ"
  },
  semester: 5,
  schedule: [
    {
      type: "Lessons",
      name: "Понедельник",
      n1: "111-3, лб, Старовойтов Е.А., Базы данных",
      z1: "119-3, лк, Шутов А.В., Базы данных"
    }
  ],
  quality: { valid: true, scheduleEntries: 1, lessonDays: 1, examEntries: 0, warnings: [] },
  scheduleHash: HASH,
  capturedAt: "2026-09-18T16:31:59.322Z"
};

beforeEach(() => {
  resetStaticCatalogCache();
});

describe("staticDataUrl", () => {
  it("строит путь от BASE_URL, чтобы работать в подкаталоге Pages", () => {
    expect(staticDataUrl("catalog.json")).toMatch(/\/data\/catalog\.json$/);
    expect(staticDataUrl("/schedule/abc.json")).toMatch(/\/data\/schedule\/abc\.json$/);
  });
});

describe("normalizeStaticCatalog", () => {
  it("читает каталог и отдаёт институты", () => {
    const catalog = normalizeStaticCatalog(catalogPayload);
    expect(catalog.groupCount).toBe(3);
    expect(catalogInstitutes(catalog)).toHaveLength(1);
  });

  it("отвергает каталог неизвестной версии", () => {
    expect(() => normalizeStaticCatalog({ ...catalogPayload, schemaVersion: 2 })).toThrow();
  });

  it("отбрасывает группы с испорченным идентификатором, не роняя каталог", () => {
    const broken = structuredClone(catalogPayload);
    broken.institutes[0].groups.push({ nrec: "нет", name: "X", course: null, forms: [] } as never);
    expect(normalizeStaticCatalog(broken).groupCount).toBe(3);
  });

  it("отдаёт группы всех форм обучения", () => {
    // Главная причина перехода: раньше в каталог попадала только очная форма.
    const groups = catalogGroups(normalizeStaticCatalog(catalogPayload), catalogPayload.institutes[0].id);
    expect(groups.map((group) => group.name)).toEqual(["ВИС-121", "ЗИС-123", "ПИ-124"]);
    expect(groups.find((group) => group.name === "ЗИС-123")?.forms).toEqual(["extramural"]);
  });
});

describe("normalizeStaticSnapshot", () => {
  it("принимает корректный снимок", () => {
    expect(normalizeStaticSnapshot(snapshotPayload, snapshotPayload.group.nrec).semester).toBe(5);
  });

  it("отвергает снимок чужой группы", () => {
    expect(() => normalizeStaticSnapshot(snapshotPayload, "d".repeat(32))).toThrow();
  });

  it("отвергает пустое расписание: это сбой, а не отсутствие занятий", () => {
    expect(() => normalizeStaticSnapshot({ ...snapshotPayload, schedule: [] }, snapshotPayload.group.nrec)).toThrow();
  });
});

describe("scheduleStateFromSnapshot", () => {
  it("разбирает занятия и сохраняет происхождение данных", () => {
    const state = scheduleStateFromSnapshot(
      normalizeStaticSnapshot(snapshotPayload, snapshotPayload.group.nrec),
      (days) => normalizeSchedule(days as never),
      1,
      Date.parse("2026-09-18T17:31:59.322Z")
    );

    expect(state.source).toBe("static-snapshot");
    expect(state.contentHash).toBe(HASH);
    expect(state.snapshotAgeSeconds).toBe(3600);
    expect(state.currentInfo.name).toBe("ПИ-124, ИИТЭ");
    expect(state.allLessons).toHaveLength(2);
    expect(state.allLessons.map((lesson) => lesson.weekMode)).toEqual(["numerator", "denominator"]);
  });

  it("берёт тип недели снаружи, а не из снимка", () => {
    // Старый снимок не должен переворачивать неделю: её считает календарь.
    const snapshot = normalizeStaticSnapshot(snapshotPayload, snapshotPayload.group.nrec);
    const asNumerator = scheduleStateFromSnapshot(snapshot, (days) => normalizeSchedule(days as never), 1);
    const asDenominator = scheduleStateFromSnapshot(snapshot, (days) => normalizeSchedule(days as never), 2);
    expect(asNumerator.currentInfo.currentWeekType).toBe(1);
    expect(asDenominator.currentInfo.currentWeekType).toBe(2);
  });
});

describe("учебная неделя ВлГУ", () => {
  it("считает неделю с 1 сентября числителем", () => {
    expect(vlsuWeekModeForDate(new Date(2026, 8, 2))).toBe("numerator");
    expect(vlsuWeekTypeForDate(new Date(2026, 8, 2))).toBe(1);
  });

  it("переключает знаменатель на следующей неделе", () => {
    expect(vlsuWeekModeForDate(new Date(2026, 8, 9))).toBe("denominator");
    expect(vlsuWeekTypeForDate(new Date(2026, 8, 9))).toBe(2);
  });

  it("не зависит от того, когда снят снимок", () => {
    const spy = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2027-01-01T00:00:00Z"));
    expect(vlsuWeekModeForDate(new Date(2026, 8, 2))).toBe("numerator");
    spy.mockRestore();
  });
});
