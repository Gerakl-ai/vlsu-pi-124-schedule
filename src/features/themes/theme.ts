export type ThemeId = "obsidian" | "porcelain" | "signal" | "field";

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  caption: string;
  themeColor: string;
  colors: [string, string, string, string];
  isLight?: boolean;
}

export const THEME_STORAGE_KEY = "lad.theme";

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
  }
];

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

export function applyTheme(themeId: ThemeId) {
  const theme = THEMES.find((item) => item.id === themeId) ?? THEMES[0];
  document.documentElement.dataset.theme = theme.id;
  document.documentElement.style.colorScheme = theme.isLight ? "light" : "dark";
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", theme.themeColor);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme.id);
  } catch {
    // Theme still applies for the current session.
  }
}
