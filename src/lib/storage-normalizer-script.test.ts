import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const script = fileURLToPath(
  new URL("../../scripts/normalize-media-storage-refs.mjs", import.meta.url)
);

describe("storage normalization database URL", () => {
  it.each([
    ["remote TLS override", "postgresql://fake:fake@db.example/db?ssl=0", "ssl"],
    ["loopback host override", "postgresql://fake:fake@localhost/db?host=db.example", "host"],
    ["loopback port override", "postgresql://fake:fake@localhost/db?port=9999", "port"],
    ["credential override", "postgresql://fake:fake@localhost/db?user=someone", "user"],
    ["session override", "postgresql://fake:fake@localhost/db?options=-csearch_path%3Devil", "options"],
    [
      "remote certificate override",
      "postgresql://fake:fake@db.example/db?sslrootcert=untrusted.pem",
      "sslrootcert",
    ],
  ])("rejects %s before connecting", (_label, url, parameter) => {
    const result = spawnSync(process.execPath, [script], {
      encoding: "utf8",
      env: {
        ...process.env,
        DIRECT_URL: url,
        NEXT_PUBLIC_SUPABASE_URL: "https://clinic.example",
      },
      timeout: 10_000,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `Unsupported database URL parameter for storage normalization: ${parameter}`
    );
    expect(result.stderr).not.toContain("ECONN");
  });
});
