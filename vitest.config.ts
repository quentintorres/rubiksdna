import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/**/__tests__/**/*.test.ts",
      "packages/**/src/**/*.test.ts",
      "apps/web/**/*.test.ts",
    ],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
