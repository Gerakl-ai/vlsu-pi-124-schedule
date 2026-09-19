import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { STUDY_FORM_KEYS } from "../../src/features/groups/groupTypes";
import { catalogGroups, catalogInstitutes, normalizeStaticCatalog } from "../../src/lib/staticData";

/**
 * Договор между обходом и приложением.
 *
 * Обход (scripts/snapshot) и клиент разбирают один и тот же файл, но написаны
 * порознь. Этот тест берёт настоящий собранный каталог и прогоняет его через
 * клиентский разбор: если формат разъедется, поломка вылезет здесь, а не у
 * студента при выборе группы.
 *
 * В CI файла может не быть — снимки живут в ветке data, — тогда тест
 * пропускается.
 */

const catalogPath = path.resolve(process.cwd(), "data/catalog.json");
const hasCatalog = existsSync(catalogPath);

describe.skipIf(!hasCatalog)("собранный каталог читается приложением", () => {
  // Читаем лениво: тело describe выполняется при сборе тестов даже у
  // пропускаемого набора, поэтому чтение прямо здесь роняло CI, где каталога
  // нет — снимки живут в ветке data и в main не коммитятся.
  let cached;
  const catalogOf = () => (cached ??= normalizeStaticCatalog(JSON.parse(readFileSync(catalogPath, "utf8"))));

  it("содержит все институты ВлГУ", () => {
    expect(catalogOf().institutes.length).toBeGreaterThanOrEqual(10);
    expect(catalogInstitutes(catalogOf()).every((institute) => institute.name && institute.shortName)).toBe(true);
  });

  it("не имеет двух институтов с одинаковым сокращением", () => {
    // Из-за этого «Юридический институт» и юридическое отделение СПО
    // выглядели одинаково.
    const shortNames = catalogInstitutes(catalogOf()).map((institute) => institute.shortName);
    expect(new Set(shortNames).size).toBe(shortNames.length);
  });

  it("содержит группы всех трёх форм обучения", () => {
    const seen = new Set();
    for (const institute of catalogOf().institutes) {
      for (const group of catalogGroups(catalogOf(), institute.id)) {
        for (const form of group.forms ?? []) seen.add(form);
      }
    }
    expect([...seen].sort()).toEqual([...STUDY_FORM_KEYS].sort());
  });

  it("не показывает только очную форму", () => {
    // Ровно это и было сломано: WFormed=0 отсекал больше трети групп ВлГУ.
    let total = 0;
    let fullTimeOnly = 0;
    for (const institute of catalogOf().institutes) {
      for (const group of catalogGroups(catalogOf(), institute.id)) {
        total += 1;
        if ((group.forms ?? []).every((form) => form === "full-time")) fullTimeOnly += 1;
      }
    }
    expect(total).toBeGreaterThan(fullTimeOnly);
  });

  it("выдаёт группы с корректными идентификаторами", () => {
    const groups = catalogOf().institutes.flatMap((institute) => catalogGroups(catalogOf(), institute.id));
    expect(groups.length).toBe(catalogOf().groupCount);
    expect(groups.every((group) => /^[a-f\d]{32}$/i.test(group.nrec))).toBe(true);
  });
});
