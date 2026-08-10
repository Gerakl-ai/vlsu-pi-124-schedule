import { describe, expect, it } from "vitest";
import { DEFAULT_THEME_ID, THEMES } from "./theme";

describe("theme definitions", () => {
  it("keeps theme ids unique", () => {
    const ids = THEMES.map((theme) => theme.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("starts with a complete light theme", () => {
    const initialTheme = THEMES.find((theme) => theme.id === DEFAULT_THEME_ID);

    expect(initialTheme).toBeDefined();
    expect(initialTheme?.isLight).toBe(true);
    expect(initialTheme?.themeColor).toBe(initialTheme?.colors[0]);
  });
});
