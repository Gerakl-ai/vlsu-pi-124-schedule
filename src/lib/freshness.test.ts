import { describe, expect, it } from "vitest";

import { freshnessNotice } from "./freshness";

const NOW = Date.parse("2026-09-18T12:00:00Z");
const hoursAgo = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString();
const daysAgo = (days: number) => hoursAgo(days * 24);

describe("freshnessNotice", () => {
  it("молчит, пока расписание свежее суток", () => {
    expect(freshnessNotice(hoursAgo(2), NOW)?.warn).toBe(false);
    expect(freshnessNotice(hoursAgo(23), NOW)?.warn).toBe(false);
  });

  it("предупреждает после суток без обновлений", () => {
    const notice = freshnessNotice(hoursAgo(30), NOW);
    expect(notice?.level).toBe("aging");
    expect(notice?.warn).toBe(true);
    expect(notice?.title).toContain("17 сентября");
  });

  it("после трёх суток советует свериться с сайтом ВлГУ", () => {
    // Ровно тот случай, что наблюдался в проде: снимок десятидневной давности
    // подавался как обычное расписание.
    const notice = freshnessNotice(daysAgo(10), NOW);
    expect(notice?.level).toBe("stale");
    expect(notice?.title).toContain("устарело");
    expect(notice?.detail).toContain("10 дней");
    expect(notice?.detail).toContain("сайте ВлГУ");
  });

  it("склоняет дни по-русски", () => {
    expect(freshnessNotice(daysAgo(1), NOW)?.detail).toContain("1 день");
    expect(freshnessNotice(daysAgo(2), NOW)?.detail).toContain("2 дня");
    expect(freshnessNotice(daysAgo(5), NOW)?.detail).toContain("5 дней");
    expect(freshnessNotice(daysAgo(11), NOW)?.detail).toContain("11 дней");
    expect(freshnessNotice(daysAgo(21), NOW)?.detail).toContain("21 день");
  });

  it("не падает на пустом и битом значении", () => {
    expect(freshnessNotice(undefined, NOW)).toBeNull();
    expect(freshnessNotice("не дата", NOW)).toBeNull();
  });

  it("не считает будущее отрицательным возрастом", () => {
    // Часы устройства могут отставать; это не повод пугать пользователя.
    expect(freshnessNotice(new Date(NOW + 3_600_000).toISOString(), NOW)?.warn).toBe(false);
  });
});
