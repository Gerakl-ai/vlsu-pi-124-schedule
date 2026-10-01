import type { AppTab } from "../types";

export const SCREEN_SWIPE_EDGE_PX = 34;
export const SCREEN_SWIPE_DAY_PX = 46;
export const SCREEN_SWIPE_TAB_PX = 64;

const TAB_ORDER: AppTab[] = ["today", "week", "notes", "settings"];

export type ScreenSwipeAction =
  | { kind: "day"; offset: -1 | 1 }
  | { kind: "tab"; tab: AppTab }
  | null;

interface ScreenSwipeInput {
  activeTab: AppTab;
  startX: number;
  viewportWidth: number;
  deltaX: number;
  deltaY: number;
  blocked?: boolean;
}

export function adjacentTab(activeTab: AppTab, deltaX: number): AppTab | null {
  const currentIndex = TAB_ORDER.indexOf(activeTab);
  const nextIndex = currentIndex + (deltaX < 0 ? 1 : -1);
  return TAB_ORDER[nextIndex] ?? null;
}

export function isLongScreenSwipe(deltaX: number, viewportWidth: number) {
  return Math.abs(deltaX) >= Math.max(150, viewportWidth * 0.42);
}

export function resolveScreenSwipe({
  activeTab,
  startX,
  viewportWidth,
  deltaX,
  deltaY,
  blocked = false
}: ScreenSwipeInput): ScreenSwipeAction {
  if (blocked) return null;

  const horizontalDistance = Math.abs(deltaX);
  if (horizontalDistance < SCREEN_SWIPE_DAY_PX || horizontalDistance < Math.abs(deltaY) * 1.2) return null;

  const fromLeftEdge = startX <= SCREEN_SWIPE_EDGE_PX && deltaX > 0;
  const fromRightEdge = startX >= viewportWidth - SCREEN_SWIPE_EDGE_PX && deltaX < 0;
  const requestsTab = (
    ((fromLeftEdge || fromRightEdge) && horizontalDistance >= SCREEN_SWIPE_TAB_PX)
    || isLongScreenSwipe(deltaX, viewportWidth)
  );

  if (requestsTab) {
    const tab = adjacentTab(activeTab, deltaX);
    if (tab) return { kind: "tab", tab };
  }

  if (activeTab === "today") return { kind: "day", offset: deltaX < 0 ? 1 : -1 };
  return null;
}

