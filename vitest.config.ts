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
    // The WhatsApp worker's pure modules (no Baileys/Express imports) are tested here too.
    include: ["src/**/*.test.ts", "services/whatsapp-worker/src/**/*.test.ts"],
    // The 5s default is too tight when the whole suite runs in parallel on a
    // busy machine: a few tests that import heavy modules or spawn a process
    // took 6-12s and failed locally while passing alone and in CI. 20s still
    // fails a genuinely stuck test.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
