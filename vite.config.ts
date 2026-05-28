import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
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
