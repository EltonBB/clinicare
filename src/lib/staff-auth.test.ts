import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const staffDevice = { findUnique: vi.fn(), update: vi.fn() };
  const checkRateLimit = vi.fn();
  const loggerError = vi.fn();
  return { staffDevice, checkRateLimit, loggerError };
});

vi.mock("@/lib/prisma", () => ({
  prisma: { staffDevice: mocks.staffDevice },
}));

vi.mock("@/lib/rate-limit", async () => {
  // Real clientIpFromHeaders (pure); mocked checkRateLimit — the real one
  // keeps in-memory counters in a module-level global that would otherwise
  // accumulate across every test in this file sharing the same "unknown" IP
  // key, eventually 429-ing an unrelated later test.
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit");
  return { ...actual, checkRateLimit: mocks.checkRateLimit };
});

vi.mock("@/lib/logger", () => ({
  logger: { error: mocks.loggerError, warn: vi.fn(), info: vi.fn() },
}));

import {
  bearerToken,
  generateAccessCode,
  generateDeviceToken,
  hashAccessCode,
  hashDeviceToken,
  normalizeCode,
  sha256Hex,
} from "@/lib/staff-auth-crypto";
import { DEVICE_TOKEN_TTL_MS, requireStaffContext } from "./staff-auth";

describe("sha256Hex", () => {
  it("is deterministic and 64 hex chars", () => {
    expect(sha256Hex("abc")).toBe(sha256Hex("abc"));
    expect(sha256Hex("abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex("abc")).not.toBe(sha256Hex("abd"));
  });
});

describe("generateDeviceToken", () => {
  it("is a 256-bit base64url token, unique per call", () => {
    const a = generateDeviceToken();
    const b = generateDeviceToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/); // base64url, no padding
    expect(Buffer.from(a, "base64url")).toHaveLength(32);
  });

  it("hashes deterministically", () => {
    const t = generateDeviceToken();
    expect(hashDeviceToken(t)).toBe(hashDeviceToken(t));
    expect(hashDeviceToken(t)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("generateAccessCode", () => {
  it("is XXXX-XXXX-XXXX of Crockford base32 (no I/L/O/U)", () => {
    for (let i = 0; i < 50; i += 1) {
      const code = generateAccessCode();
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
      expect(code).not.toMatch(/[ILOU]/);
    }
  });

  it("yields ~60 bits of entropy worth of distinct values", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) seen.add(generateAccessCode());
    expect(seen.size).toBe(200);
  });

  it("normalizes to exactly 12 alphabet chars (dashes stripped, stable under folding)", () => {
    const normalized = normalizeCode(generateAccessCode());
    expect(normalized).toMatch(/^[0-9A-HJKMNP-TV-Z]{12}$/);
  });
});

describe("normalizeCode", () => {
  it("uppercases, folds O->0 and I/L->1, strips separators", () => {
    expect(normalizeCode("oil")).toBe("011");
    expect(normalizeCode("ab1c-d2ef 3gh4")).toBe("AB1CD2EF3GH4");
    expect(normalizeCode("  ab1c-d2ef-3gh4  ")).toBe("AB1CD2EF3GH4");
  });
});

describe("hashAccessCode", () => {
  it("is format-insensitive (dashes/case/ambiguous glyphs do not change the hash)", () => {
    const canonical = hashAccessCode("AB1C-D2EF-3GH4");
    expect(hashAccessCode("ab1cd2ef3gh4")).toBe(canonical);
    expect(hashAccessCode("ab1c d2ef 3gh4")).toBe(canonical);
  });

  it("folds ambiguous input to the same hash as the canonical glyphs", () => {
    // O/I/L typed by a user resolve to 0/1/1.
    expect(hashAccessCode("OIL0")).toBe(hashAccessCode("0110"));
  });
});

describe("bearerToken", () => {
  function req(headers: Record<string, string>) {
    return new Request("https://example.test/api/mobile/v1/me", { headers });
  }

  it("extracts the token, case-insensitively on the scheme", () => {
    expect(bearerToken(req({ authorization: "Bearer abc.def" }))).toBe("abc.def");
    expect(bearerToken(req({ authorization: "bearer abc" }))).toBe("abc");
  });

  it("returns null for missing or malformed headers", () => {
    expect(bearerToken(req({}))).toBeNull();
    expect(bearerToken(req({ authorization: "Basic abc" }))).toBeNull();
    expect(bearerToken(req({ authorization: "Bearer" }))).toBeNull();
  });
});

describe("requireStaffContext", () => {
  const NOW = new Date("2026-06-01T12:00:00.000Z");
  const RAW_TOKEN = "test-raw-device-token";
  const TOKEN_HASH = hashDeviceToken(RAW_TOKEN);
  const BUSINESS = { id: "biz_1", name: "Test Clinic" };
  const STAFF_MEMBER = { id: "staff_1", isActive: true, status: "ACTIVE" };

  function makeDevice(overrides: Record<string, unknown> = {}) {
    return {
      id: "device_1",
      tokenHash: TOKEN_HASH,
      revokedAt: null,
      expiresAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000), // 1 day out
      createdAt: new Date(NOW.getTime() - 24 * 60 * 60 * 1000), // enrolled yesterday
      lastSeenAt: NOW, // just seen — under the refresh threshold by default
      staffMember: STAFF_MEMBER,
      business: BUSINESS,
      ...overrides,
    };
  }

  function req(token: string | null = RAW_TOKEN) {
    return new Request("https://example.test/api/mobile/v1/me", {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, remaining: 599, retryAfterSeconds: 0 });
    mocks.staffDevice.update.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refuses a rate-limited caller before any DB lookup", async () => {
    mocks.checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 12 });

    const result = await requireStaffContext(req());

    expect(result).toMatchObject({ status: 429 });
    expect(mocks.staffDevice.findUnique).not.toHaveBeenCalled();
  });

  it("refuses with no bearer token, before any DB lookup", async () => {
    const result = await requireStaffContext(req(null));

    expect(result).toMatchObject({ status: 401 });
    expect(mocks.staffDevice.findUnique).not.toHaveBeenCalled();
  });

  it("refuses when no device matches the token", async () => {
    mocks.staffDevice.findUnique.mockResolvedValue(null);

    const result = await requireStaffContext(req());

    expect(result).toMatchObject({ status: 401 });
  });

  it("refuses a revoked device", async () => {
    mocks.staffDevice.findUnique.mockResolvedValue(makeDevice({ revokedAt: NOW }));

    const result = await requireStaffContext(req());

    expect(result).toMatchObject({ status: 401 });
  });

  it("refuses an expired device", async () => {
    mocks.staffDevice.findUnique.mockResolvedValue(
      makeDevice({ expiresAt: new Date(NOW.getTime() - 1000) })
    );

    const result = await requireStaffContext(req());

    expect(result).toMatchObject({ status: 401 });
  });

  it("refuses once the absolute 90-day cap is exceeded, even with recent activity", async () => {
    // Enrolled 91 days ago but actively used since (expiresAt/lastSeenAt both
    // look fresh) — the absolute cap must still reject it on its own, since
    // it exists precisely to stop an active device sliding forever.
    mocks.staffDevice.findUnique.mockResolvedValue(
      makeDevice({ createdAt: new Date(NOW.getTime() - 91 * 24 * 60 * 60 * 1000) })
    );

    const result = await requireStaffContext(req());

    expect(result).toMatchObject({ status: 401 });
  });

  it("refuses when the staff member is inactive", async () => {
    mocks.staffDevice.findUnique.mockResolvedValue(
      makeDevice({ staffMember: { ...STAFF_MEMBER, isActive: false } })
    );

    const result = await requireStaffContext(req());

    expect(result).toMatchObject({ status: 401 });
  });

  it("refuses when the staff member's status is INACTIVE", async () => {
    mocks.staffDevice.findUnique.mockResolvedValue(
      makeDevice({ staffMember: { ...STAFF_MEMBER, status: "INACTIVE" } })
    );

    const result = await requireStaffContext(req());

    expect(result).toMatchObject({ status: 401 });
  });

  it("returns the staff context for a valid device, without writing when the session isn't stale", async () => {
    mocks.staffDevice.findUnique.mockResolvedValue(makeDevice({ lastSeenAt: NOW }));

    const result = await requireStaffContext(req());

    expect("error" in result).toBe(false);
    expect(result).toMatchObject({ staffMember: STAFF_MEMBER, business: BUSINESS });
    expect(mocks.staffDevice.update).not.toHaveBeenCalled();
  });

  it("extends the session once it's past the sliding-refresh threshold", async () => {
    const stale = new Date(NOW.getTime() - 2 * 60 * 60 * 1000); // 2h ago > 1h threshold
    mocks.staffDevice.findUnique.mockResolvedValue(makeDevice({ lastSeenAt: stale }));

    const result = await requireStaffContext(req());

    expect("error" in result).toBe(false);
    expect(mocks.staffDevice.update).toHaveBeenCalledWith({
      where: { id: "device_1" },
      data: { lastSeenAt: NOW, expiresAt: new Date(NOW.getTime() + DEVICE_TOKEN_TTL_MS) },
    });
  });

  it("still returns the valid context when the best-effort session-refresh write fails", async () => {
    const stale = new Date(NOW.getTime() - 2 * 60 * 60 * 1000);
    mocks.staffDevice.findUnique.mockResolvedValue(makeDevice({ lastSeenAt: stale }));
    mocks.staffDevice.update.mockRejectedValue(new Error("db down"));

    const result = await requireStaffContext(req());

    expect("error" in result).toBe(false);
    expect(mocks.loggerError).toHaveBeenCalled();
  });
});
