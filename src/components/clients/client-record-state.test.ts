import { describe, expect, it } from "vitest";

import { olderClientRecord, reconcileIncomingClient } from "@/components/clients/client-record-state";
import type { ClientRecord } from "@/lib/clients";

function record(paymentId: string, medicalHistory: string, readGeneration?: string) {
  return {
    id: "patient-1",
    payments: [{ id: paymentId }],
    medical: { medicalHistory },
    readGeneration,
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
    const oldRecord = record("payment-1", "old history", "9");
    const saved = record("payment-2", "updated history", "11");
    const lateStaleRefresh = record("payment-1", "old history", "10");
    const laterFreshRefresh = record("payment-2", "updated history", "12");
    const afterSave = { source: oldRecord, client: saved };

    expect(olderClientRecord(lateStaleRefresh, saved)).toBe(true);
    expect(reconcileIncomingClient(afterSave, lateStaleRefresh, false)).toBe(afterSave);
    expect(reconcileIncomingClient(afterSave, laterFreshRefresh, false).client).toBe(laterFreshRefresh);
  });
});
