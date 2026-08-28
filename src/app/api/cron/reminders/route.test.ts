import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const acquireCronLock = vi.fn();
const releaseCronLock = vi.fn();
const syncAppointmentRemindersJob = vi.fn();
const autoCloseStaleTimeEntries = vi.fn();
const isAuthorizedCronRequest = vi.fn();

vi.mock("@/lib/cron-lock", () => ({ acquireCronLock, releaseCronLock }));
vi.mock("@/lib/cron-auth", () => ({ isAuthorizedCronRequest }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/staff-clock", () => ({ autoCloseStaleTimeEntries }));
vi.mock("@/lib/reminders", async () => {
  const actual = await vi.importActual<typeof import("@/lib/reminders")>(
    "@/lib/reminders"
  );
  return {
    ...actual,
    syncAppointmentRemindersJob,
  };
});

function request() {
  return new Request("https://x.test/api/cron/reminders", {
    headers: { authorization: "Bearer test" },
  });
}

describe("reminders cron route", () => {
  beforeEach(() => {
    acquireCronLock.mockReset().mockResolvedValue(true);
    releaseCronLock.mockReset().mockResolvedValue(undefined);
    syncAppointmentRemindersJob.mockReset();
    autoCloseStaleTimeEntries.mockReset().mockResolvedValue({ closed: 0 });
    // Every test defaults to an authorized request; the 401 test below is the
    // one exception. A vi.fn() here (not a plain arrow function) so that
    // exception is a plain mockReturnValueOnce, not a doMock/resetModules
    // dance whose override could otherwise bleed into a test added after it.
    isAuthorizedCronRequest.mockReset().mockReturnValue(true);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("skips the run and never calls the job when the lock is held", async () => {
    acquireCronLock.mockResolvedValue(false);
    const { GET } = await import("./route");

    const res = await GET(request());
    const body = await res.json();

    expect(body).toMatchObject({ ok: true, skipped: true });
    expect(syncAppointmentRemindersJob).not.toHaveBeenCalled();
    expect(releaseCronLock).not.toHaveBeenCalled();
  });

  it("acquires and releases the lock on a normal completion", async () => {
    syncAppointmentRemindersJob.mockResolvedValue({
      processedBusinesses: 2,
      sent: 2,
      failed: 0,
      skippedBusinesses: 0,
    });
    const { GET } = await import("./route");

    const res = await GET(request());
    const body = await res.json();

    expect(body).toMatchObject({ ok: true, sent: 2, timedOut: false });
    expect(acquireCronLock).toHaveBeenCalledTimes(1);
    expect(releaseCronLock).toHaveBeenCalledTimes(1);
  });

  /**
   * Pins the fix from this PR's own review: on a genuine timeout the lock must
   * stay held (the TTL is what protects it) rather than being released right
   * before the abandoned work might still be writing.
   */
  it("does NOT release the lock when the job hangs past the hard deadline", async () => {
    syncAppointmentRemindersJob.mockReturnValue(new Promise(() => {})); // never resolves
    const { GET } = await import("./route");

    const responsePromise = GET(request());
    await vi.advanceTimersByTimeAsync(280_000); // past the 270s hard deadline
    const res = await responsePromise;
    const body = await res.json();

    expect(body).toMatchObject({ ok: true, timedOut: true });
    expect(acquireCronLock).toHaveBeenCalledTimes(1);
    expect(releaseCronLock).not.toHaveBeenCalled();
  });

  it("reports real partial progress on timeout, not zeros", async () => {
    // The job never resolves, but it mutates the SAME progress object the
    // route passes in — exactly what a real abandoned-but-partially-done run
    // looks like.
    syncAppointmentRemindersJob.mockImplementation(async (_deadline, progress) => {
      progress.total = 5;
      progress.sent = 3;
      progress.failed = 1;
      progress.skipped = 0;
      return new Promise(() => {}); // then hang forever
    });
    const { GET } = await import("./route");

    const responsePromise = GET(request());
    await vi.advanceTimersByTimeAsync(280_000);
    const res = await responsePromise;
    const body = await res.json();

    expect(body).toMatchObject({
      timedOut: true,
      processedBusinesses: 5,
      sent: 3,
      failed: 1,
    });
  });

  it("returns 401 without a valid cron secret, without touching the lock", async () => {
    isAuthorizedCronRequest.mockReturnValue(false);
    const { GET } = await import("./route");

    const res = await GET(request());
    expect(res.status).toBe(401);
    expect(acquireCronLock).not.toHaveBeenCalled();
  });
});
