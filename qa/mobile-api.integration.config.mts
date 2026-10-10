import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["qa/mobile-api.integration.test.ts"],
    testTimeout: 15_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
