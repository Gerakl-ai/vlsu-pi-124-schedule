import { describe, expect, it } from "vitest";
import { resolveScreenSwipe } from "./screenGestures";

describe("resolveScreenSwipe", () => {
  it("changes the selected day for a regular swipe inside Today", () => {
    expect(resolveScreenSwipe({ activeTab: "today", startX: 180, viewportWidth: 402, deltaX: -82, deltaY: 8 }))
      .toEqual({ kind: "day", offset: 1 });
  });

  it("changes the app tab for an inward edge swipe", () => {
    expect(resolveScreenSwipe({ activeTab: "week", startX: 399, viewportWidth: 402, deltaX: -76, deltaY: 5 }))
      .toEqual({ kind: "tab", tab: "notes" });
  });

  it("changes the app tab for a long swipe across the screen", () => {
    expect(resolveScreenSwipe({ activeTab: "today", startX: 120, viewportWidth: 402, deltaX: -190, deltaY: 12 }))
      .toEqual({ kind: "tab", tab: "week" });
  });

  it("does not steal vertical scrolling or blocked note gestures", () => {
    expect(resolveScreenSwipe({ activeTab: "today", startX: 180, viewportWidth: 402, deltaX: -70, deltaY: 110 })).toBeNull();
    expect(resolveScreenSwipe({ activeTab: "notes", startX: 180, viewportWidth: 402, deltaX: -190, deltaY: 8, blocked: true })).toBeNull();
  });
});

