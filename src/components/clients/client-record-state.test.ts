import { describe, expect, it } from "vitest";

import { olderClientRecord, reconcileIncomingClient } from "@/components/clients/client-record-state";
import type { ClientRecord } from "@/lib/clients";

function record(paymentId: string, medicalHistory: string, readSnapshot?: string) {
  return {
    id: "patient-1",
    payments: [{ id: paymentId }],
    medical: { medicalHistory },
    readSnapshot,
  } as ClientRecord;
}

describe("patient record refresh", () => {
  it("accepts a refreshed record for the same patient, including payments and medical background", () => {
    const oldRecord = record("payment-1", "old history");
    const refreshed = record("payment-2", "updated history");
    const state = { source: oldRecord, client: oldRecord };

    const next = reconcileIncomingClient(state, refreshed, false);
    expect(next.client).toBe(refreshed);
    expect(next.client.payments[0].id).toBe("payment-2");
    expect(next.client.medical.medicalHistory).toBe("updated history");
    expect(reconcileIncomingClient(next, refreshed, false)).toBe(next);
  });

  it("keeps an in-flight mutation result ahead of an older refresh", () => {
    const oldRecord = record("payment-1", "old history");
    const refreshDuringSave = record("payment-1", "old history");
    const saved = record("payment-3", "new history");
    const state = { source: oldRecord, client: oldRecord };

    expect(reconcileIncomingClient(state, refreshDuringSave, true)).toBe(state);
    const afterSave = { source: refreshDuringSave, client: saved };
    expect(reconcileIncomingClient(afterSave, refreshDuringSave, false)).toBe(afterSave);
    expect(afterSave.client).toBe(saved);
  });

  it("accepts a refresh if the pending mutation fails", () => {
    const oldRecord = record("payment-1", "old history");
    const refreshed = record("payment-2", "updated history");
    const state = { source: oldRecord, client: oldRecord };

    expect(reconcileIncomingClient(state, refreshed, true)).toBe(state);
    expect(reconcileIncomingClient(state, refreshed, false).client).toBe(refreshed);
  });

  it("rejects a pre-save refresh that arrives after success, then accepts a newer read", () => {
    const oldRecord = record("payment-1", "old history", "8:9:");
    const saved = record("payment-2", "updated history", "8:11:");
    const lateStaleRefresh = record("payment-1", "old history", "8:10:");
    const laterFreshRefresh = record("payment-2", "updated history", "8:12:");
    const afterSave = { source: oldRecord, client: saved };

    expect(olderClientRecord(lateStaleRefresh, saved)).toBe(true);
    expect(reconcileIncomingClient(afterSave, lateStaleRefresh, false)).toBe(afterSave);
    expect(reconcileIncomingClient(afterSave, laterFreshRefresh, false).client).toBe(laterFreshRefresh);
  });

  it("orders equal high-water snapshots by committed transactions", () => {
    const stale = record("payment-1", "old history", "8:12:9,10");
    const fresh = record("payment-2", "new history", "8:12:10");
    expect(olderClientRecord(stale, fresh)).toBe(true);
    expect(olderClientRecord(fresh, stale)).toBe(false);
  });

  it("does not discard a genuinely newer read merely because an older request began first", () => {
    const earlierRead = record("payment-1", "old history", "8:12:10");
    const laterRead = record("payment-2", "new history", "8:13:10");
    expect(olderClientRecord(laterRead, earlierRead)).toBe(false);
    expect(reconcileIncomingClient({ source: earlierRead, client: earlierRead }, laterRead, false).client)
      .toBe(laterRead);
  });
});
