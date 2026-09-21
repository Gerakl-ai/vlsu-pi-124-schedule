import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// В CI берём коммит, локально — время сборки. Главное, чтобы значение менялось
// каждый раз: от него зависит и адрес service worker, и имя кэша.
const release = (process.env.GITHUB_SHA ?? "").slice(0, 7)
  || new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);

export default defineConfig({
  define: {
    __RELEASE__: JSON.stringify(release)
  },
  // GitHub Pages раздаёт проектный сайт из подкаталога /<repo>/, а свой домен —
  // из корня. Базовый путь задаётся переменной окружения при сборке, чтобы
  // один и тот же код работал в обоих случаях.
  base: process.env.PAGES_BASE ?? "/",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/vlsu-api": {
        target: "https://abiturient-api.vlsu.ru/api",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/vlsu-api/, "")
      }
    }
  }
});
