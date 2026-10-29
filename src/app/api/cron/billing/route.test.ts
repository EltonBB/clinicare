import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  acquireCronLock: vi.fn(),
  releaseCronLock: vi.fn(),
  isAuthorizedCronRequest: vi.fn(),
  paddleConfig: vi.fn(),
  reconcileOverdueSubscriptions: vi.fn(),
}));

vi.mock("@/lib/cron-lock", () => ({ acquireCronLock: mocks.acquireCronLock, releaseCronLock: mocks.releaseCronLock }));
vi.mock("@/lib/cron-auth", () => ({ isAuthorizedCronRequest: mocks.isAuthorizedCronRequest }));
vi.mock("@/lib/cron-monitor", () => ({ withCronMonitor: (_path: string, run: () => Promise<Response>) => run() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/paddle/paddle-config", () => ({ paddleConfig: mocks.paddleConfig }));
vi.mock("@/lib/paddle/reconcile", () => ({ reconcileOverdueSubscriptions: mocks.reconcileOverdueSubscriptions }));
vi.mock("@/lib/pro-trial-data", () => ({ endExpiredProTrials: vi.fn(async () => 0) }));

import { GET } from "./route";

const request = () => new Request("https://x.test/api/cron/billing", { headers: { authorization: "Bearer test" } });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isAuthorizedCronRequest.mockReturnValue(true);
  mocks.paddleConfig.mockReturnValue({});
  mocks.acquireCronLock.mockResolvedValue({ proceed: true, token: "t" });
  mocks.reconcileOverdueSubscriptions.mockResolvedValue({ checked: 1, applied: 1, failed: 0 });
});

describe("billing reconcile cron", () => {
  it("refuses an unauthorized request", async () => {
    mocks.isAuthorizedCronRequest.mockReturnValue(false);
    expect((await GET(request())).status).toBe(401);
    expect(mocks.reconcileOverdueSubscriptions).not.toHaveBeenCalled();
  });

  it("does nothing while billing isn't configured", async () => {
    mocks.paddleConfig.mockReturnValue(null);
    expect(await (await GET(request())).json()).toMatchObject({ skipped: true, reason: "billing_not_configured" });
    expect(mocks.acquireCronLock).not.toHaveBeenCalled();
  });

  it("reconciles under the lock and releases it", async () => {
    expect(await (await GET(request())).json()).toMatchObject({ ok: true, checked: 1, applied: 1, degraded: false });
    expect(mocks.releaseCronLock).toHaveBeenCalledWith("billing-reconcile", "t");
  });

  it("reports a degraded run when a Paddle call failed", async () => {
    mocks.reconcileOverdueSubscriptions.mockResolvedValue({ checked: 2, applied: 1, failed: 1 });
    expect(await (await GET(request())).json()).toMatchObject({ degraded: true });
  });
});
