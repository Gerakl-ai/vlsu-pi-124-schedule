import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { applyTheme, readTheme } from "./features/themes/theme";
import { RELEASE_CHANNEL } from "./release";
import "./styles.css";
import "./theme.css";
import "./features/notes/notes.css";

type ViewportOrientation = "portrait" | "landscape";

const stableViewportHeights: Record<ViewportOrientation, number> = { portrait: 0, landscape: 0 };
let keyboardOpen = false;
let viewportFrame = 0;
let appliedVisualHeight = 0;
let appliedVisualOffset = -1;

function viewportOrientation(): ViewportOrientation {
  return window.matchMedia("(orientation: landscape)").matches ? "landscape" : "portrait";
}

function commitAppViewportHeight() {
  const visualViewport = window.visualViewport;
  const visualHeight = Math.round(visualViewport?.height || window.innerHeight || document.documentElement.clientHeight);
  const layoutHeight = Math.round(window.innerHeight || document.documentElement.clientHeight || visualHeight);
  const orientation = viewportOrientation();
  const stableHeight = stableViewportHeights[orientation];
  const activeElement = document.activeElement;
  const editing = activeElement instanceof HTMLElement && (
    activeElement.isContentEditable || activeElement.matches("input, textarea, select, [role='textbox']")
  );
  const viewportLoss = Math.max(
    0,
    layoutHeight - visualHeight,
    stableHeight > 0 ? stableHeight - visualHeight : 0
  );
  const threshold = keyboardOpen ? 64 : 104;
  const nextKeyboardOpen = Boolean(visualViewport && viewportLoss > threshold && (editing || keyboardOpen));

  keyboardOpen = nextKeyboardOpen;
  if (!keyboardOpen && layoutHeight > 0) stableViewportHeights[orientation] = layoutHeight;
  // CSS 100dvh owns the app shell; standalone WebKit may report an innerHeight with safe areas already removed.
  document.documentElement.style.removeProperty("--app-viewport-height");
  if (Math.abs(visualHeight - appliedVisualHeight) > 1) {
    appliedVisualHeight = visualHeight;
    document.documentElement.style.setProperty("--visual-viewport-height", `${visualHeight}px`);
  }
  const visualOffset = Math.max(0, Math.round(visualViewport?.offsetTop ?? 0));
  if (Math.abs(visualOffset - appliedVisualOffset) > 1) {
    appliedVisualOffset = visualOffset;
    document.documentElement.style.setProperty("--visual-viewport-offset-top", `${visualOffset}px`);
  }
  document.documentElement.dataset.keyboard = keyboardOpen ? "open" : "closed";
}

function syncAppViewportHeight() {
  window.cancelAnimationFrame(viewportFrame);
  viewportFrame = window.requestAnimationFrame(commitAppViewportHeight);
}

commitAppViewportHeight();
applyTheme(readTheme());
window.addEventListener("resize", syncAppViewportHeight);
window.visualViewport?.addEventListener("resize", syncAppViewportHeight);
window.visualViewport?.addEventListener("scroll", syncAppViewportHeight);
window.addEventListener("orientationchange", syncAppViewportHeight);
document.addEventListener("focusin", syncAppViewportHeight);
document.addEventListener("focusout", syncAppViewportHeight);

for (const eventName of ["gesturestart", "gesturechange", "gestureend"]) {
  document.addEventListener(eventName, (event) => event.preventDefault(), { passive: false });
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    const hadController = Boolean(navigator.serviceWorker.controller);
    let refreshing = false;
    if (hadController) {
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
    }
    const workerUrl = `/sw.js?release=${encodeURIComponent(RELEASE_CHANNEL)}`;
    navigator.serviceWorker.register(workerUrl, { updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch(() => {
        // PWA registration is progressive enhancement; the app still works online.
      });
  });
}

if ("serviceWorker" in navigator && import.meta.env.DEV) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => registration.unregister());
  });
}
