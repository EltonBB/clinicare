import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Pure-function unit tests only (no DB, no React, no Next runtime). Mirrors the
// `@/*` -> `./src/*` alias from tsconfig.json so test imports match source.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
