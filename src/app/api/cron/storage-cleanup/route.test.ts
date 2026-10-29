import { beforeEach, describe, expect, it, vi } from "vitest";

const { acquireCronLock, releaseCronLock, isAuthorizedCronRequest, sweepPendingStorageCleanup } = vi.hoisted(() => ({
  acquireCronLock: vi.fn(),
  releaseCronLock: vi.fn(),
  isAuthorizedCronRequest: vi.fn(),
  sweepPendingStorageCleanup: vi.fn(),
}));

vi.mock("@/lib/cron-lock", () => ({ acquireCronLock, releaseCronLock }));
vi.mock("@/lib/cron-auth", () => ({ isAuthorizedCronRequest }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/media-storage-server", () => ({ sweepPendingStorageCleanup }));

// Imported once, after the mocks: a cold import inside a test can outlast its timeout on a loaded machine.
import { GET } from "./route";

function request() {
  return new Request("https://x.test/api/cron/storage-cleanup", {
    headers: { authorization: "Bearer test" },
  });
}

describe("storage-cleanup cron route", () => {
  beforeEach(() => {
    acquireCronLock.mockReset().mockResolvedValue({ proceed: true, token: "test-token" });
    releaseCronLock.mockReset().mockResolvedValue(undefined);
    isAuthorizedCronRequest.mockReset().mockReturnValue(true);
    sweepPendingStorageCleanup.mockReset().mockResolvedValue({
      serviceRoleConfigured: true,
      due: 0,
      cleaned: 0,
      invalidRowsDropped: 0,
      retryScheduled: 0,
    });
  });

  it("returns 401 without a valid cron secret, without touching the lock", async () => {
    isAuthorizedCronRequest.mockReturnValue(false);
    const res = await GET(request());

    expect(res.status).toBe(401);
    expect(acquireCronLock).not.toHaveBeenCalled();
    expect(sweepPendingStorageCleanup).not.toHaveBeenCalled();
  });

  it("skips the run and never calls the sweep when the lock is held", async () => {
    acquireCronLock.mockResolvedValue({ proceed: false, token: null });
    const res = await GET(request());
    const body = await res.json();

    expect(body).toMatchObject({ ok: true, skipped: true });
    expect(sweepPendingStorageCleanup).not.toHaveBeenCalled();
    expect(releaseCronLock).not.toHaveBeenCalled();
  });

  it("runs the sweep, releases the lock with this invocation's token, and reports the result", async () => {
    sweepPendingStorageCleanup.mockResolvedValue({
      serviceRoleConfigured: true,
      due: 3,
      cleaned: 2,
      invalidRowsDropped: 0,
      retryScheduled: 1,
    });
    const res = await GET(request());
    const body = await res.json();

    expect(body).toMatchObject({ ok: true, due: 3, cleaned: 2, retryScheduled: 1 });
    expect(acquireCronLock).toHaveBeenCalledTimes(1);
    expect(releaseCronLock).toHaveBeenCalledWith("storage-cleanup", "test-token");
  });

  it("releases the lock even when the sweep throws, and responds 500", async () => {
    sweepPendingStorageCleanup.mockRejectedValue(new Error("boom"));
    const res = await GET(request());

    expect(res.status).toBe(500);
    expect(releaseCronLock).toHaveBeenCalledWith("storage-cleanup", "test-token");
  });

  it("releases nothing when the lock acquisition was fail-open (no token)", async () => {
    acquireCronLock.mockResolvedValue({ proceed: true, token: null });
    await GET(request());

    expect(releaseCronLock).toHaveBeenCalledWith("storage-cleanup", null);
  });
});
