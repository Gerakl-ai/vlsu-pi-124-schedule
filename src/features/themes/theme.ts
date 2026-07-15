export type ThemeId = "obsidian" | "porcelain" | "signal" | "field" | "custom";

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  caption: string;
  themeColor: string;
  colors: [string, string, string, string];
  isLight?: boolean;
  isCustom?: boolean;
}

export interface CustomTheme {
  name: string;
  mode: "dark" | "light";
  background: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  signal: string;
  success: string;
}

export const THEME_STORAGE_KEY = "lad.theme";
export const CUSTOM_THEME_STORAGE_KEY = "lad.custom-theme";

export const DEFAULT_CUSTOM_THEME: CustomTheme = {
  name: "Мой свет",
  mode: "dark",
  background: "#080b12",
  surface: "#131c2a",
  text: "#f7f9fc",
  muted: "#94a2b5",
  accent: "#72b8ff",
  signal: "#ff6b72",
  success: "#61dfbd"
};

export const THEMES: ThemeDefinition[] = [
  {
    id: "obsidian",
    name: "Obsidian",
    caption: "Графит, кобальт и рубиновый сигнал",
    themeColor: "#05070a",
    colors: ["#05070a", "#dce8ff", "#5b8cff", "#ff6b5f"]
  },
  {
    id: "porcelain",
    name: "Porcelain",
    caption: "Холодный фарфор, чернила и киноварь",
    themeColor: "#eef2f7",
    colors: ["#eef2f7", "#111827", "#2457d6", "#e4473e"],
    isLight: true
  },
  {
    id: "signal",
    name: "Signal Room",
    caption: "Карбон, эфирный красный и мятный свет",
    themeColor: "#090a0c",
    colors: ["#090a0c", "#f2f0ea", "#ff4d52", "#58dfc2"]
  },
  {
    id: "field",
    name: "Field Notes",
    caption: "Тёмный лес, сталь и сигнальный лайм",
    themeColor: "#07110f",
    colors: ["#07110f", "#edf3ee", "#bdd45a", "#78a9ff"]
  },
  {
    id: "custom",
    name: "Своя тема",
    caption: "Персональная палитра из семи живых токенов",
    themeColor: DEFAULT_CUSTOM_THEME.background,
    colors: [DEFAULT_CUSTOM_THEME.background, DEFAULT_CUSTOM_THEME.text, DEFAULT_CUSTOM_THEME.accent, DEFAULT_CUSTOM_THEME.signal],
    isCustom: true
  }
];

const CUSTOM_PROPERTIES = [
  "--bg", "--bg-deep", "--surface", "--surface-strong", "--line", "--line-strong", "--text", "--muted",
  "--cyan", "--blue", "--coral", "--green", "--warning", "--ruby", "--ice", "--accent-rgb",
  "--accent-soft-rgb", "--signal-rgb", "--signal-deep-rgb", "--success-rgb", "--theme-body", "--theme-frame",
  "--theme-panel", "--theme-panel-solid", "--theme-panel-border", "--theme-control", "--theme-control-active",
  "--theme-nav", "--theme-nav-text", "--theme-grid-rgb", "--theme-image-filter", "--theme-image-opacity", "--shadow"
];

function isHex(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function hexToRgb(value: string) {
  const normalized = value.slice(1);
  return [Number.parseInt(normalized.slice(0, 2), 16), Number.parseInt(normalized.slice(2, 4), 16), Number.parseInt(normalized.slice(4, 6), 16)] as const;
}

function shiftHex(value: string, amount: number) {
  const rgb = hexToRgb(value).map((channel) => Math.max(0, Math.min(255, Math.round(channel + amount))));
  return `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function rgbString(value: string) {
  return hexToRgb(value).join(", ");
}

function validCustomTheme(value: unknown): value is CustomTheme {
  if (!value || typeof value !== "object") return false;
  const theme = value as Record<string, unknown>;
  return (
    typeof theme.name === "string" &&
    (theme.mode === "dark" || theme.mode === "light") &&
    ["background", "surface", "text", "muted", "accent", "signal", "success"].every((key) => isHex(theme[key]))
  );
}

export function isThemeId(value: string | null): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

export function readTheme(): ThemeId {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeId(stored)) return stored;
  } catch {
    // Storage can be unavailable in private browsing; the default remains usable.
  }
  return "signal";
}

export function readCustomTheme(): CustomTheme {
  try {
    const stored = localStorage.getItem(CUSTOM_THEME_STORAGE_KEY);
    if (!stored) return DEFAULT_CUSTOM_THEME;
    const parsed: unknown = JSON.parse(stored);
    return validCustomTheme(parsed) ? parsed : DEFAULT_CUSTOM_THEME;
  } catch {
    return DEFAULT_CUSTOM_THEME;
  }
}

export function saveCustomTheme(theme: CustomTheme) {
  try {
    localStorage.setItem(CUSTOM_THEME_STORAGE_KEY, JSON.stringify(theme));
  } catch {
    // The live preview remains active even when persistence is unavailable.
  }
}

function clearCustomProperties() {
  CUSTOM_PROPERTIES.forEach((property) => document.documentElement.style.removeProperty(property));
}

function applyCustomProperties(theme: CustomTheme) {
  const root = document.documentElement;
  const deep = shiftHex(theme.background, theme.mode === "dark" ? -12 : -20);
  const strongSurface = shiftHex(theme.surface, theme.mode === "dark" ? 8 : 14);
  const signalDeep = shiftHex(theme.signal, -52);
  const accentSoft = shiftHex(theme.accent, theme.mode === "dark" ? 62 : 28);
  const navText = theme.muted;
  const imageFilter = theme.mode === "dark" ? "saturate(.72) contrast(1.12) brightness(.72)" : "saturate(.62) contrast(1.08) brightness(.82)";
  const values: Record<string, string> = {
    "--bg": theme.background,
    "--bg-deep": deep,
    "--surface": `rgba(${rgbString(theme.surface)}, .86)`,
    "--surface-strong": `rgba(${rgbString(strongSurface)}, .94)`,
    "--line": `rgba(${rgbString(accentSoft)}, .15)`,
    "--line-strong": `rgba(${rgbString(theme.accent)}, .58)`,
    "--text": theme.text,
    "--muted": theme.muted,
    "--cyan": theme.accent,
    "--blue": theme.signal,
    "--coral": theme.signal,
    "--green": theme.success,
    "--warning": shiftHex(theme.signal, 34),
    "--ruby": signalDeep,
    "--ice": accentSoft,
    "--accent-rgb": rgbString(theme.accent),
    "--accent-soft-rgb": rgbString(accentSoft),
    "--signal-rgb": rgbString(theme.signal),
    "--signal-deep-rgb": rgbString(signalDeep),
    "--success-rgb": rgbString(theme.success),
    "--theme-body": `linear-gradient(118deg, rgba(${rgbString(theme.accent)}, .12), transparent 38%), linear-gradient(316deg, rgba(${rgbString(theme.signal)}, .08), transparent 50%), ${theme.background}`,
    "--theme-frame": `repeating-linear-gradient(90deg, rgba(${rgbString(accentSoft)}, .025) 0 1px, transparent 1px 40px), radial-gradient(520px 360px at 92% -6%, rgba(${rgbString(theme.accent)}, .13), transparent 70%), linear-gradient(180deg, ${strongSurface}, ${deep})`,
    "--theme-panel": `linear-gradient(135deg, rgba(${rgbString(theme.text)}, .05), transparent 40%), linear-gradient(145deg, rgba(${rgbString(theme.surface)}, .94), rgba(${rgbString(deep)}, .96))`,
    "--theme-panel-solid": `rgba(${rgbString(theme.surface)}, .98)`,
    "--theme-panel-border": `rgba(${rgbString(theme.accent)}, .22)`,
    "--theme-control": `rgba(${rgbString(theme.accent)}, .1)`,
    "--theme-control-active": `rgba(${rgbString(theme.accent)}, .23)`,
    "--theme-nav": `linear-gradient(180deg, rgba(${rgbString(strongSurface)}, .99), rgba(${rgbString(deep)}, .995))`,
    "--theme-nav-text": navText,
    "--theme-grid-rgb": rgbString(accentSoft),
    "--theme-image-filter": imageFilter,
    "--theme-image-opacity": ".7",
    "--shadow": theme.mode === "dark" ? "0 30px 90px rgba(0, 0, 0, .58)" : "0 30px 90px rgba(25, 39, 60, .22)"
  };
  Object.entries(values).forEach(([property, value]) => root.style.setProperty(property, value));
}

export function applyTheme(themeId: ThemeId, customTheme = readCustomTheme()) {
  const theme = THEMES.find((item) => item.id === themeId) ?? THEMES[0];
  const custom = theme.id === "custom";
  clearCustomProperties();
  if (custom) applyCustomProperties(customTheme);
  document.documentElement.dataset.theme = theme.id;
  document.documentElement.dataset.themeMode = custom ? customTheme.mode : theme.isLight ? "light" : "dark";
  document.documentElement.style.colorScheme = custom ? customTheme.mode : theme.isLight ? "light" : "dark";
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", custom ? customTheme.background : theme.themeColor);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme.id);
  } catch {
    // Theme still applies for the current session.
  }
}
