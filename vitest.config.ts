import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: {
      DATABASE_URL: "postgresql://souqmasr:souqmasr_dev_pw@localhost:5432/souqmasr_test",
      REDIS_URL: "redis://localhost:6379",
      APP_URL: "http://localhost:3000",
    },
  },
});
