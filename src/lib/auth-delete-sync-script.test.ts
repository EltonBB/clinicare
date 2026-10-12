import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const setupScript = fileURLToPath(
  new URL("../../scripts/setup-auth-delete-sync.mjs", import.meta.url)
);

describe("auth delete sync database URL", () => {
  it.each([
    ["remote TLS override", "postgresql://fake:fake@db.example/db?ssl=0", "ssl"],
    ["loopback host override", "postgresql://fake:fake@localhost/db?host=db.example", "host"],
    [
      "remote certificate override",
      "postgresql://fake:fake@db.example/db?sslrootcert=untrusted.pem",
      "sslrootcert",
    ],
  ])("rejects %s before connecting", (_label, url, parameter) => {
    const result = spawnSync(process.execPath, [setupScript], {
      encoding: "utf8",
      env: { ...process.env, DIRECT_URL: url },
      timeout: 10_000,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Unsupported database URL parameter for auth delete sync: ${parameter}`);
    expect(result.stderr).not.toContain("ECONN");
  });
});
