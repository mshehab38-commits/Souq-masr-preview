import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    env: {
      DATABASE_URL: "postgresql://souqmasr:souqmasr_dev_pw@localhost:5432/souqmasr?schema=public",
      REDIS_URL: "redis://localhost:6379",
      APP_URL: "http://localhost:3000",
    },
  },
});
