import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { INSTITUTE_PALETTE_COUNT, INSTITUTE_VISUALS } from "../../src/features/groups/instituteVisuals";

/**
 * Проверки, которым нужен доступ к файлам: в src их держать нельзя, потому что
 * в проекте нет @types/node и tsc на них спотыкается.
 */
describe("стили описывают все палитры", () => {
  it("на каждую палитру из таблицы есть правило в styles.css", () => {
    const styles = readFileSync(new URL("../../src/styles.css", import.meta.url), "utf8");
    for (let palette = 1; palette <= INSTITUTE_PALETTE_COUNT; palette += 1) {
      expect(styles).toContain(`.institute-badge[data-visual$="-${palette}"]`);
    }
  });
});

describe("таблица совпадает с каталогом ВлГУ", () => {
  const catalogPath = new URL("../../data/catalog.json", import.meta.url);
  const hasCatalog = existsSync(catalogPath);

  it.skipIf(!hasCatalog)("каждый институт из собранного каталога есть в таблице", () => {
    // Если ВлГУ заведёт новое подразделение, тест укажет на это до того, как
    // студент увидит значок без цвета.
    const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
    const missing = catalog.institutes.filter((institute) => !INSTITUTE_VISUALS[institute.id]);
    expect(missing.map((institute) => institute.name)).toEqual([]);
  });
});
