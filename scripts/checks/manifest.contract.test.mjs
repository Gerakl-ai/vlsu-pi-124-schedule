import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Манифест и service worker копируются в сборку как есть: Vite переписывает
 * пути только в index.html. Поэтому любой абсолютный путь здесь ломает
 * приложение на проектном сайте GitHub Pages, который живёт в подкаталоге
 * /<repo>/: иконки отдают 404, PWA не устанавливается, воркер кэширует чужие
 * адреса.
 *
 * Ошибка незаметная — на своём домене всё работает, — поэтому она закреплена
 * тестом.
 */

const manifest = JSON.parse(readFileSync(new URL("../../public/manifest.webmanifest", import.meta.url), "utf8"));
const worker = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");

describe("манифест переживает подкаталог Pages", () => {
  it("не содержит абсолютных путей", () => {
    const absolute = [];
    const walk = (value, trail) => {
      if (typeof value === "string" && value.startsWith("/")) absolute.push(`${trail}: ${value}`);
      else if (Array.isArray(value)) value.forEach((item, index) => walk(item, `${trail}[${index}]`));
      else if (value && typeof value === "object") {
        for (const [key, item] of Object.entries(value)) walk(item, trail ? `${trail}.${key}` : key);
      }
    };
    walk(manifest, "");
    expect(absolute).toEqual([]);
  });

  it("точка входа задана относительно манифеста", () => {
    expect(manifest.start_url).toBe("./");
    expect(manifest.scope).toBe("./");
  });

  it("разделяет обычную и маскируемую иконки", () => {
    // Одна картинка на оба назначения — частая ошибка: маскируемой нужна
    // безопасная зона, иначе Android срежет знак по краям.
    const purposes = manifest.icons.map((icon) => icon.purpose);
    expect(purposes).toContain("any");
    expect(purposes).toContain("maskable");
    expect(purposes.every((purpose) => !purpose.includes(" "))).toBe(true);
  });

  it("каждая иконка из манифеста лежит в public", () => {
    for (const icon of manifest.icons) {
      const file = new URL(`../../public/${icon.src}`, import.meta.url);
      expect(() => readFileSync(file)).not.toThrow();
    }
  });
});

describe("service worker переживает подкаталог Pages", () => {
  it("выводит базовый путь из собственного адреса", () => {
    expect(worker).toContain("self.location.pathname.replace");
  });

  it("не прописывает абсолютных путей приложения", () => {
    // Перечислены именно те литералы, что ломались на Pages: все они обязаны
    // строиться через path(). Список точный, а не регулярка по всему файлу —
    // иначе в него попадают куски регулярных выражений из самого воркера.
    const forbidden = [
      '"/manifest.webmanifest"',
      '"/index.html"',
      '"/icons/',
      '"/assets/',
      '"/images/',
      '"/vlsu-api/"',
      '"/app-api/"'
    ];
    expect(forbidden.filter((literal) => worker.includes(literal))).toEqual([]);
  });

  it("кэширует оболочку по базовому пути, а не по корню домена", () => {
    expect(worker).toContain("cache.match(BASE)");
    expect(worker).not.toContain('cache.match("/")');
  });
});
