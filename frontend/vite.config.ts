import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev proxies /api and /health to the FastAPI backend on 5001.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:5001",
      "/health": "http://127.0.0.1:5001",
    },
  },
});
