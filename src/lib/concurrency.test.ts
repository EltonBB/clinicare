import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { withDeadline } from "./concurrency";

describe("withDeadline", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves with the work's result when it settles before the deadline", async () => {
    const result = withDeadline(Promise.resolve("done"), 1_000, () => "timed-out");
    await expect(result).resolves.toBe("done");
  });

  it("falls back to onTimeout's result when work never settles", async () => {
    const result = withDeadline(new Promise(() => {}), 1_000, () => "timed-out");
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(result).resolves.toBe("timed-out");
  });

  it("does not fire the timeout once work has already settled", async () => {
    const onTimeout = vi.fn(() => "timed-out");
    const result = withDeadline(Promise.resolve("done"), 1_000, onTimeout);
    await expect(result).resolves.toBe("done");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("swallows a late rejection from abandoned work after timing out", async () => {
    let reject!: (error: unknown) => void;
    const work = new Promise<string>((_resolve, r) => {
      reject = r;
    });
    const result = withDeadline(work, 1_000, () => "timed-out");
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(result).resolves.toBe("timed-out");

    // The abandoned promise rejects after the deadline already gave up on it
    // — must not become an unhandled rejection or throw out of withDeadline.
    reject(new Error("late failure"));
    await vi.advanceTimersByTimeAsync(0);
  });

  it("allows success and timeout branches to return differently-shaped objects", async () => {
    type Success = { ok: true; value: number };
    type Timeout = { ok: false };

    const onTime = withDeadline<Success, Timeout>(
      Promise.resolve({ ok: true, value: 7 }),
      1_000,
      () => ({ ok: false })
    );
    await expect(onTime).resolves.toEqual({ ok: true, value: 7 });

    const late = withDeadline<Success, Timeout>(new Promise(() => {}), 1_000, () => ({
      ok: false,
    }));
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(late).resolves.toEqual({ ok: false });
  });
});
