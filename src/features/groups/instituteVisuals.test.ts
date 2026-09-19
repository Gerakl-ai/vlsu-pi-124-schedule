import { describe, expect, it } from "vitest";

import {
  INSTITUTE_PALETTE_COUNT,
  INSTITUTE_VISUALS,
  instituteShortName,
  instituteVisual,
  instituteVisualKey
} from "./instituteVisuals";

describe("таблица знаков институтов", () => {
  it("покрывает все четырнадцать подразделений ВлГУ", () => {
    expect(Object.keys(INSTITUTE_VISUALS)).toHaveLength(14);
  });

  it("не даёт двум институтам одинаковое сокращение", () => {
    // Из-за этого «Юридический институт» и юридическое отделение СПО выглядели
    // в списке одинаково.
    const shortNames = Object.values(INSTITUTE_VISUALS).map((visual) => visual.shortName);
    expect(new Set(shortNames).size).toBe(shortNames.length);
  });

  it("не даёт двум институтам одинаковый цвет", () => {
    // Раньше палитр было восемь на четырнадцать институтов.
    const palettes = Object.values(INSTITUTE_VISUALS).map((visual) => visual.palette);
    expect(new Set(palettes).size).toBe(palettes.length);
  });

  it("использует только палитры, описанные в стилях", () => {
    for (const visual of Object.values(INSTITUTE_VISUALS)) {
      expect(visual.palette).toBeGreaterThanOrEqual(1);
      expect(visual.palette).toBeLessThanOrEqual(INSTITUTE_PALETTE_COUNT);
    }
  });

  it("выдаёт ключ в том виде, который ждут стили", () => {
    expect(instituteVisualKey("5b42fa53ec1dd1892e5ec44a3a60a896", "Институт информационных технологий и электроники"))
      .toBe("institute-1");
    expect(instituteShortName("5b42fa53ec1dd1892e5ec44a3a60a896", "неважно")).toBe("ИИТЭ");
  });

  it("не зависит от названия: переименование не меняет знак", () => {
    const id = "928b59357e2f04b381282fe605b710da";
    expect(instituteVisual(id, "Юридический институт")).toEqual(instituteVisual(id, "Юридический институт ВлГУ"));
  });

  it("для нового подразделения выдаёт устойчивый цвет из допустимого диапазона", () => {
    const first = instituteVisual("ffffffffffffffffffffffffffffffff", "Институт новых технологий");
    const second = instituteVisual("ffffffffffffffffffffffffffffffff", "Институт новых технологий");
    expect(first).toEqual(second);
    expect(first.palette).toBeGreaterThanOrEqual(1);
    expect(first.palette).toBeLessThanOrEqual(INSTITUTE_PALETTE_COUNT);
    // Слово «институт» в сокращение не входит: иначе все они начинались бы на И.
    expect(first.shortName).toBe("НТ");
  });
});
