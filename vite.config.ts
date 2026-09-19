import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
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
