import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeApiPayload, loadGroups, loadInstitutes, normalizeCachedSchedule, normalizeSchedule, parseLessonText, type ExamSessionDto, type ScheduleDayDto } from "./scheduleApi";

const subgroupSlot = [
  "109-3, лб, Аджамиех С.М., Основы frontend разработки",
  "111-3, лб, Старовойтов Е.А., Алгоритмизация и программирование"
].join("\n");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("VLSU catalogs", () => {
  it("normalizes institutes from the public catalog", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([
      { Value: "iite-id", Text: "Институт информационных технологий и электроники" },
      { Value: "gi-id", Text: "Гуманитарный институт" }
    ]), { status: 200, headers: { "Content-Type": "application/json" } })));

    const institutes = await loadInstitutes();

    expect(institutes).toHaveLength(2);
    expect(institutes.find((item) => item.id === "iite-id")).toMatchObject({
      name: "Институт информационных технологий и электроники",
      shortName: "ИИТЭ"
    });
  });

  it("normalizes and naturally sorts groups for an institute", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ value: [
      { Nrec: "b", Name: "ПИ-124", Course: "3 курс" },
      { Nrec: "a", Name: "ПИ-99", Course: "4 курс" }
    ] }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const groups = await loadGroups("iite-id");

    expect(groups.map((group) => group.name)).toEqual(["ПИ-99", "ПИ-124"]);
    expect(groups[1]).toMatchObject({ nrec: "b", course: "3 курс" });
    expect(fetchMock).toHaveBeenCalledWith("/vlsu-api/student/GetStudGroups", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ Institut: "iite-id", WFormed: 0 })
    }));
  });
});

describe("decodeApiPayload", () => {
  it("unwraps JSON that the upstream API encoded as a string", () => {
    expect(decodeApiPayload('[{"type":"Lessons","name":"Понедельник"}]')).toEqual([
      { type: "Lessons", name: "Понедельник" }
    ]);
  });

  it("leaves ordinary text untouched", () => {
    expect(decodeApiPayload("НЕИЗВЕСТНО")).toBe("НЕИЗВЕСТНО");
  });
});

describe("parseLessonText", () => {
  it("parses a regular lesson into structured fields", () => {
    expect(parseLessonText("111-3, лк, Шутов А.В., Базы данных")).toEqual({
      subject: "Базы данных",
      room: "111-3",
      kind: "лк",
      teacher: "Шутов А.В.",
      variants: [{
        subject: "Базы данных",
        room: "111-3",
        kind: "лк",
        teacher: "Шутов А.В.",
        rawText: "111-3, лк, Шутов А.В., Базы данных"
      }]
    });
  });

  it("keeps simultaneous subgroup lessons separate", () => {
    const parsed = parseLessonText(subgroupSlot);

    expect(parsed.subject).toBe("Основы frontend разработки / Алгоритмизация и программирование");
    expect(parsed.room).toBe("109-3 / 111-3");
    expect(parsed.kind).toBe("лб");
    expect(parsed.teacher).toBe("Аджамиех С.М. / Старовойтов Е.А.");
    expect(parsed.variants).toHaveLength(2);
    expect(parsed.variants.map((variant) => variant.subject)).toEqual([
      "Основы frontend разработки",
      "Алгоритмизация и программирование"
    ]);
  });

  it("supports lessons without room and teacher metadata", () => {
    const parsed = parseLessonText("Элективные дисциплины по физической культуре и спорту");
    expect(parsed.subject).toBe("Элективные дисциплины по физической культуре и спорту");
    expect(parsed.room).toBeUndefined();
  });
});

describe("normalizeSchedule", () => {
  it("creates one all-week slot when numerator and denominator are equal", () => {
    const day: ScheduleDayDto = {
      type: "Lessons",
      name: "Пятница",
      n1: subgroupSlot,
      z1: subgroupSlot
    };

    const lessons = normalizeSchedule([day]);
    expect(lessons).toHaveLength(1);
    expect(lessons[0]).toMatchObject({
      dayIndex: 5,
      pairIndex: 1,
      weekMode: "all",
      subject: "Основы frontend разработки / Алгоритмизация и программирование"
    });
    expect(lessons[0].variants).toHaveLength(2);
  });

  it("keeps different numerator and denominator lessons separate", () => {
    const day: ScheduleDayDto = {
      type: "Lessons",
      name: "Вторник",
      n3: "111-3, лк, Шутов А.В., Базы данных",
      z3: "111-3, пр, Шутов А.В., Алгоритмизация и программирование"
    };

    const lessons = normalizeSchedule([day]);
    expect(lessons.map((lesson) => lesson.dayIndex)).toEqual([2, 2]);
    expect(lessons.map((lesson) => lesson.weekMode)).toEqual(["numerator", "denominator"]);
  });

  it("normalizes exam sessions without relying on pair indexes", () => {
    const session: ExamSessionDto = {
      type: "ExamSession",
      date: "20.07.2026",
      time: "09:00",
      isConsultation: false,
      name: "111-3, экз, Шутов А.В., Базы данных"
    };

    expect(normalizeSchedule([session])[0]).toMatchObject({
      date: "2026-07-20",
      start: "09:00",
      end: "10:30",
      subject: "Базы данных",
      scheduleKind: "exam"
    });
  });

  it("repairs legacy cached lessons with merged subgroup text", () => {
    const cached = normalizeCachedSchedule({
      groupNrec: "group",
      currentInfo: { currentLesson: "", currentWeekType: 1, name: "ПИ-124", semester: 4 },
      fetchedAt: "2026-07-17T00:00:00.000Z",
      allLessons: [{
        id: "legacy",
        dayIndex: 5,
        dayName: "Пятница",
        pairIndex: 1,
        start: "08:30",
        end: "10:00",
        subject: "Основы frontend разработки 111-3, лб, Старовойтов Е.А., Алгоритмизация и программирование",
        room: "109-3",
        kind: "лб",
        rawText: subgroupSlot,
        weekMode: "all"
      }]
    });

    expect(cached.allLessons[0].subject).toBe("Основы frontend разработки / Алгоритмизация и программирование");
    expect(cached.allLessons[0].variants).toHaveLength(2);
    expect(cached.weekTypeAsOf).toBe("2026-07-17T00:00:00.000Z");
  });
});
