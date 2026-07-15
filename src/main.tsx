import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { applyTheme, readTheme } from "./features/themes/theme";
import "./styles.css";
import "./theme.css";
import "./features/notes/notes.css";

function isStandaloneDisplay() {
  return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function syncAppViewportHeight() {
  const visualHeight = window.visualViewport?.height ?? 0;
  const innerHeight = window.innerHeight || 0;
  const screenHeight = isStandaloneDisplay() && window.matchMedia("(orientation: portrait)").matches ? window.screen.height || 0 : 0;
  const height = Math.ceil(Math.max(visualHeight, innerHeight, screenHeight));

  if (height > 0) {
    document.documentElement.style.setProperty("--app-viewport-height", `${height}px`);
  }
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

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // PWA registration is progressive enhancement; the app still works online.
    });
  });
}

if ("serviceWorker" in navigator && import.meta.env.DEV) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => registration.unregister());
  });
}
