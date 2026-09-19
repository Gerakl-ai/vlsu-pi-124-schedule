/**
 * Сборка PNG-иконок приложения из описания знака.
 *
 * Знак геометрический — скруглённые прямоугольники, — поэтому растеризатор
 * помещается в сотню строк и не требует ни Playwright, ни sharp: лишние 150 МБ
 * зависимостей ради трёх картинок того не стоят.
 *
 * Сглаживание считается через знаковое расстояние до скруглённого
 * прямоугольника: для прямых углов и скруглений этого достаточно, а результат
 * получается чище, чем у передискретизации.
 *
 * Источник правды по форме — public/icons/icon.svg. Меняя одно, меняйте второе.
 *
 * Запуск: node scripts/icons/buildIcons.mjs
 */

import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const CANVAS = 512;

const BRAND = { r: 0xc9, g: 0x60, b: 0x2d };
const INK = { r: 0xf7, g: 0xef, b: 0xe6 };

/** Дробь: числитель сверху, дробная черта, знаменатель снизу. */
const BARS = [
  { x: 172, y: 160, w: 168, h: 48, r: 24, alpha: 1 },
  { x: 116, y: 242, w: 280, h: 28, r: 14, alpha: 1 },
  { x: 200, y: 304, w: 112, h: 48, r: 24, alpha: 1 }
];

/** Знаковое расстояние до скруглённого прямоугольника. Отрицательное — внутри. */
function roundedRectDistance(px, py, x, y, w, h, radius) {
  const halfW = w / 2;
  const halfH = h / 2;
  const r = Math.min(radius, halfW, halfH);
  const dx = Math.abs(px - (x + halfW)) - (halfW - r);
  const dy = Math.abs(py - (y + halfH)) - (halfH - r);
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  const inside = Math.min(Math.max(dx, dy), 0);
  return outside + inside - r;
}

/** Покрытие пикселя фигурой: половина пикселя по обе стороны границы. */
function coverage(distance) {
  return Math.min(1, Math.max(0, 0.5 - distance));
}

function blend(target, offset, color, alpha) {
  if (alpha <= 0) return;
  const inv = 1 - alpha;
  target[offset] = Math.round(color.r * alpha + target[offset] * inv);
  target[offset + 1] = Math.round(color.g * alpha + target[offset + 1] * inv);
  target[offset + 2] = Math.round(color.b * alpha + target[offset + 2] * inv);
  target[offset + 3] = Math.round(255 * alpha + target[offset + 3] * inv);
}

/**
 * @param {object} options
 * @param {number} options.size итоговый размер в пикселях
 * @param {number|null} options.backgroundRadius радиус подложки; null — без подложки
 * @param {number} options.markScale масштаб знака относительно холста
 * @param {boolean} options.monochrome рисовать только знак, одним цветом
 */
function renderIcon({ size, backgroundRadius, markScale = 1, monochrome = false }) {
  const pixels = new Uint8Array(size * size * 4);
  const scale = size / CANVAS;
  const center = CANVAS / 2;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      // Центр пикселя в координатах исходного холста 512x512.
      const px = (x + 0.5) / scale;
      const py = (y + 0.5) / scale;

      if (backgroundRadius !== null) {
        const bg = coverage(roundedRectDistance(px, py, 0, 0, CANVAS, CANVAS, backgroundRadius));
        blend(pixels, offset, monochrome ? INK : BRAND, bg);
      }

      for (const bar of BARS) {
        // Масштабирование знака от центра — так он попадает в безопасную зону
        // маскируемой иконки, а фон остаётся под обрез.
        const mx = center + (px - center) / markScale;
        const my = center + (py - center) / markScale;
        const hit = coverage(roundedRectDistance(mx, my, bar.x, bar.y, bar.w, bar.h, bar.r));
        if (hit <= 0) continue;
        const alpha = hit * (monochrome ? 1 : bar.alpha);
        blend(pixels, offset, monochrome ? { r: 0, g: 0, b: 0 } : INK, alpha);
      }
    }
  }

  return pixels;
}

/* ------------------------------------------------------------------ *
 * Кодирование PNG
 * ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(pixels, size) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // 8 бит на канал
  header[9] = 6; // RGBA
  // фильтр 0 у каждой строки: знак плоский, предсказание ничего не даст
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0;
    Buffer.from(pixels.buffer, y * size * 4, size * 4).copy(raw, rowStart + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

/* ------------------------------------------------------------------ */

const targets = [
  { file: "icon-192.png", size: 192, backgroundRadius: 114, markScale: 1 },
  { file: "icon-512.png", size: 512, backgroundRadius: 114, markScale: 1 },
  // Маскируемая: фон под обрез, знак ужат в безопасную зону.
  { file: "icon-maskable-512.png", size: 512, backgroundRadius: 0, markScale: 0.78 }
];

const outDir = path.resolve(process.cwd(), "public/icons");

for (const target of targets) {
  const pixels = renderIcon({
    size: target.size,
    backgroundRadius: target.backgroundRadius,
    markScale: target.markScale
  });
  const png = encodePng(pixels, target.size);
  writeFileSync(path.join(outDir, target.file), png);
  console.log(`${target.file}: ${target.size}x${target.size}, ${(png.length / 1024).toFixed(1)} КБ`);
}
