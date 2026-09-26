import { beforeEach, describe, expect, it, vi } from "vitest";

const acquireCronLock = vi.fn();
const releaseCronLock = vi.fn();
const isAuthorizedCronRequest = vi.fn();
const generateFollowUpDrafts = vi.fn();
const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };

vi.mock("@/lib/cron-lock", () => ({ acquireCronLock, releaseCronLock }));
vi.mock("@/lib/cron-auth", () => ({ isAuthorizedCronRequest }));
vi.mock("@/lib/logger", () => ({ logger }));
vi.mock("@/lib/follow-up-generation", () => ({ generateFollowUpDrafts }));

function request() {
  return new Request("https://x.test/api/cron/follow-ups", {
    headers: { authorization: "Bearer test" },
  });
}

describe("follow-ups cron route", () => {
  beforeEach(() => {
    acquireCronLock.mockReset().mockResolvedValue({ proceed: true, token: "test-token" });
    releaseCronLock.mockReset().mockResolvedValue(undefined);
    isAuthorizedCronRequest.mockReset().mockReturnValue(true);
    generateFollowUpDrafts.mockReset().mockResolvedValue({
      businessesProcessed: 0,
      draftsCreated: 0,
      draftsExpired: 0,
      errors: 0,
    });
    logger.error.mockReset();
    logger.warn.mockReset();
  });

  it("returns 401 without a valid cron secret, without touching the lock or the job", async () => {
    isAuthorizedCronRequest.mockReturnValue(false);
    const { GET } = await import("./route");

    const res = await GET(request());

    expect(res.status).toBe(401);
    expect(acquireCronLock).not.toHaveBeenCalled();
    expect(generateFollowUpDrafts).not.toHaveBeenCalled();
  });

  it("skips the run, never calls the job, and releases nothing when the lock is held", async () => {
    acquireCronLock.mockResolvedValue({ proceed: false, token: null });
    const { GET } = await import("./route");

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(body).toEqual({ ok: true, skipped: true, reason: "previous_run_in_progress" });
    expect(generateFollowUpDrafts).not.toHaveBeenCalled();
    expect(releaseCronLock).not.toHaveBeenCalled();
  });

  it("runs the job, reports its counts, and releases the lock with this invocation's token", async () => {
    generateFollowUpDrafts.mockResolvedValue({
      businessesProcessed: 4,
      draftsCreated: 7,
      draftsExpired: 2,
      errors: 0,
    });
    const { GET } = await import("./route");

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(body).toEqual({ ok: true, businessesProcessed: 4, draftsCreated: 7, draftsExpired: 2, errors: 0 });
    expect(acquireCronLock).toHaveBeenCalledWith("follow-ups", expect.any(Number));
    expect(releaseCronLock).toHaveBeenCalledWith("follow-ups", "test-token");
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("holds the lock for longer than the function can run, so a killed run's lock expires by TTL and never overlaps a straggler", async () => {
    const { GET, maxDuration } = await import("./route");

    await GET(request());

    const ttlSeconds = acquireCronLock.mock.calls[0][1];
    expect(ttlSeconds).toBeGreaterThan(maxDuration);
  });

  it("warns (counts only) when the run finished with per-business errors, and still answers 200", async () => {
    generateFollowUpDrafts.mockResolvedValue({
      businessesProcessed: 3,
      draftsCreated: 1,
      draftsExpired: 0,
      errors: 2,
    });
    const { GET } = await import("./route");

    const res = await GET(request());

    expect(res.status).toBe(200);
    expect(logger.warn).toHaveBeenCalledWith("Follow-up cron completed with errors.", {
      businessesProcessed: 3,
      draftsCreated: 1,
      draftsExpired: 0,
      errors: 2,
    });
  });

  it("answers a generic 500 (no internal detail) and still releases the lock when the job throws", async () => {
    generateFollowUpDrafts.mockRejectedValue(new Error("relation FollowUpDraft does not exist"));
    const { GET } = await import("./route");

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ ok: false, error: "Follow-up draft generation failed." });
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(releaseCronLock).toHaveBeenCalledWith("follow-ups", "test-token");
  });

  it("passes a null token through on a fail-open acquisition so nothing real is released", async () => {
    acquireCronLock.mockResolvedValue({ proceed: true, token: null });
    const { GET } = await import("./route");

    await GET(request());

    expect(generateFollowUpDrafts).toHaveBeenCalledTimes(1);
    expect(releaseCronLock).toHaveBeenCalledWith("follow-ups", null);
  });
});
