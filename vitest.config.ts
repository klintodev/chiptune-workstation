import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["src/v3/**/*.test.{ts,tsx}"],
    restoreMocks: true,
  },
});
