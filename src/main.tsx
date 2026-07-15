import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { applyTheme, readTheme } from "./features/themes/theme";
import "./styles.css";
import "./theme.css";
import "./features/notes/notes.css";

let stableViewportHeight = 0;

function syncAppViewportHeight() {
  const visualViewport = window.visualViewport;
  const visualHeight = visualViewport?.height ?? 0;
  const innerHeight = window.innerHeight || 0;
  const currentHeight = Math.ceil(innerHeight || visualHeight);
  const activeElement = document.activeElement;
  const editing = activeElement instanceof HTMLElement && (
    activeElement.isContentEditable || activeElement.matches("input, textarea, select, [role='textbox']")
  );
  const keyboardOpen = Boolean(
    editing && visualViewport && (
      visualHeight + 110 < innerHeight ||
      (stableViewportHeight > 0 && visualHeight + 110 < stableViewportHeight)
    )
  );

  if (!keyboardOpen && currentHeight > 0) stableViewportHeight = currentHeight;
  // CSS 100dvh owns the app shell; standalone WebKit may report an innerHeight with safe areas already removed.
  document.documentElement.style.removeProperty("--app-viewport-height");
  document.documentElement.style.setProperty("--visual-viewport-height", `${Math.ceil(visualHeight || innerHeight)}px`);
  document.documentElement.style.setProperty("--visual-viewport-offset-top", `${Math.max(0, Math.floor(visualViewport?.offsetTop ?? 0))}px`);
  document.documentElement.dataset.keyboard = keyboardOpen ? "open" : "closed";
}

syncAppViewportHeight();
applyTheme(readTheme());
window.addEventListener("resize", syncAppViewportHeight);
window.visualViewport?.addEventListener("resize", syncAppViewportHeight);
window.visualViewport?.addEventListener("scroll", syncAppViewportHeight);
window.addEventListener("orientationchange", syncAppViewportHeight);

for (const eventName of ["gesturestart", "gesturechange", "gestureend"]) {
  document.addEventListener(eventName, (event) => event.preventDefault(), { passive: false });
}

let touchStartX = 0;
let touchStartY = 0;

document.addEventListener("touchstart", (event) => {
  if (event.touches.length !== 1) return;
  touchStartX = event.touches[0].clientX;
  touchStartY = event.touches[0].clientY;
}, { passive: true });

document.addEventListener("touchmove", (event) => {
  if (event.touches.length !== 1) return;
  const currentX = event.touches[0].clientX;
  const currentY = event.touches[0].clientY;
  const deltaX = currentX - touchStartX;
  const deltaY = currentY - touchStartY;
  if (Math.abs(deltaY) <= Math.abs(deltaX)) return;
  touchStartX = currentX;
  touchStartY = currentY;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const scrollable = target.closest<HTMLElement>(".content-scroll, .rich-editor-content, .theme-sheet, .folder-sheet");
  if (!scrollable) {
    event.preventDefault();
    return;
  }
  const atTop = scrollable.scrollTop <= 0;
  const atBottom = scrollable.scrollTop + scrollable.clientHeight >= scrollable.scrollHeight - 1;
  if ((deltaY > 0 && atTop) || (deltaY < 0 && atBottom)) event.preventDefault();
}, { passive: false });

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
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
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {
      // PWA registration is progressive enhancement; the app still works online.
    });
  });
}

if ("serviceWorker" in navigator && import.meta.env.DEV) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => registration.unregister());
  });
}
