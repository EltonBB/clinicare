import { beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  captureCheckIn: vi.fn(() => "check-in-1"),
  flush: vi.fn(async () => true),
}));

vi.mock("@sentry/nextjs", () => sentry);

import { withCronMonitor } from "./cron-monitor";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("withCronMonitor", () => {
  it("opens a check-in on the vercel.json schedule and closes it ok", async () => {
    const response = await withCronMonitor("/api/cron/reminders", async () => new Response(null, { status: 200 }));

    expect(response.status).toBe(200);
    expect(sentry.captureCheckIn).toHaveBeenNthCalledWith(
      1,
      { monitorSlug: "cron-reminders", status: "in_progress" },
      expect.objectContaining({ schedule: { type: "crontab", value: "0 * * * *" } })
    );
    expect(sentry.captureCheckIn).toHaveBeenNthCalledWith(2, {
      checkInId: "check-in-1",
      monitorSlug: "cron-reminders",
      status: "ok",
    });
    expect(sentry.flush).toHaveBeenCalled();
  });

  it("marks a 5xx response as an error", async () => {
    await withCronMonitor("/api/cron/analytics", async () => new Response(null, { status: 500 }));

    expect(sentry.captureCheckIn).toHaveBeenLastCalledWith(expect.objectContaining({ status: "error" }));
  });

  it("marks a thrown run as an error and rethrows", async () => {
    await expect(
      withCronMonitor("/api/cron/follow-ups", async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    expect(sentry.captureCheckIn).toHaveBeenLastCalledWith(expect.objectContaining({ status: "error" }));
  });

  it("runs without a check-in for a path that has no schedule", async () => {
    await withCronMonitor("/api/cron/unknown", async () => new Response(null, { status: 200 }));

    expect(sentry.captureCheckIn).not.toHaveBeenCalled();
  });
});
