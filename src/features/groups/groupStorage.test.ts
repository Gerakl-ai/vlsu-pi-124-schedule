import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScheduleState } from "../../types";
import { LEGACY_PI124_GROUP } from "./groupTypes";
import {
  readFavoriteGroups,
  readGroupScheduleCache,
  readKnownGroup,
  readRecentGroups,
  readSelectedGroup,
  toggleFavoriteGroup,
  writeGroupScheduleCache,
  writeSelectedGroup
} from "./groupStorage";

function storageMock() {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
    clear: vi.fn(() => values.clear())
  };
}

describe("group storage", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", storageMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("migrates the legacy PI-124 cache without deleting it", () => {
    const schedule: ScheduleState = {
      groupNrec: LEGACY_PI124_GROUP.nrec,
      currentInfo: { currentLesson: "", currentWeekType: 1, name: "ПИ-124", semester: 5 },
      allLessons: [],
      fetchedAt: "2026-09-15T08:00:00.000Z"
    };
    localStorage.setItem("pi124.schedule.cache", JSON.stringify(schedule));

    expect(readSelectedGroup()).toEqual(LEGACY_PI124_GROUP);
    expect(readGroupScheduleCache(LEGACY_PI124_GROUP)).toEqual(schedule);
    expect(localStorage.getItem("pi124.schedule.cache")).toBeTruthy();
  });

  it("keeps independent schedule snapshots for different groups", () => {
    const other = { ...LEGACY_PI124_GROUP, id: "other", nrec: "other", name: "ИВТ-101" };
    writeSelectedGroup(other);
    writeGroupScheduleCache({
      groupNrec: other.nrec,
      currentInfo: { currentLesson: "", currentWeekType: 2, name: other.name, semester: 1 },
      allLessons: [],
      fetchedAt: "2026-09-15T09:00:00.000Z"
    });

    expect(readSelectedGroup()).toEqual(other);
    expect(readGroupScheduleCache(other)?.currentInfo.name).toBe("ИВТ-101");
    expect(readGroupScheduleCache(LEGACY_PI124_GROUP)).toBeNull();
  });

  it("keeps recent and favorite groups as full offline profiles", () => {
    const other = { ...LEGACY_PI124_GROUP, id: "other", nrec: "other", name: "ИВТ-101" };
    writeSelectedGroup(other);
    toggleFavoriteGroup(other);

    expect(readRecentGroups()).toEqual([other]);
    expect(readFavoriteGroups()).toEqual([other]);
    expect(readKnownGroup("other", other.instituteId)).toEqual(other);
    expect(toggleFavoriteGroup(other)).toEqual([]);
  });
});
