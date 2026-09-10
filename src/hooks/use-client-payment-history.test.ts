import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import type { ClientRecord, ClientPaymentEntry } from "@/lib/clients";
import { useClientPaymentHistory as readHistory } from "./use-client-payment-history";

vi.mock("react", () => ({ useState: vi.fn() }));
type History = Omit<ReturnType<typeof readHistory>, "loadMore">;
let state: History | undefined;
const fetchMock = vi.fn();
const cursor = { id: "payment-60", createdAt: "2026-09-01T12:00:00.000Z" };
const entry = { id: "payment-1" } as ClientPaymentEntry;
const client = { id: "client-1", payments: [entry], paymentNextCursor: cursor } as ClientRecord;

// Drive this hook's single useState cell and its functional updates directly.
// This verifies request interleavings; it is not a DOM/rendering test.
function render(record = client) {
  readHistory(record);
  return readHistory(record); // Settle the guarded record reset.
}

function page(payments = [{ ...entry, id: "payment-61" }]) {
  return Response.json({ payments, nextCursor: null });
}

beforeEach(() => {
  state = undefined;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(useState).mockImplementation(((initial: () => History) => {
    state ??= initial();
    return [state, (update: History | ((previous: History) => History)) => {
      state = typeof update === "function" ? update(state!) : update;
    }];
  }) as typeof useState);
});
afterEach(() => vi.unstubAllGlobals());

describe("payment history request isolation", () => {
  it("keeps entries on failure, retries the same cursor and stops at the end", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValueOnce(page());
    await render().loadMore();
    expect(render()).toMatchObject({ payments: [entry], nextCursor: cursor, loading: false });
    expect(render().error).not.toBe("");
    await render().loadMore();
    expect(render().payments.map((payment) => payment.id)).toEqual(["payment-1", "payment-61"]);
    expect(render()).toMatchObject({ nextCursor: null, error: "", loading: false });
    expect(fetchMock.mock.calls[0][0]).toBe(fetchMock.mock.calls[1][0]);
    await render().loadMore();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each(["client-1", "client-2"])("discards a late page after replacing the record with %s", async (id) => {
    let resolve!: (response: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((done) => { resolve = done; }));
    const pending = render().loadMore();
    expect(render().loading).toBe(true);
    await render().loadMore();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const refreshed = { ...client, id, payments: [{ ...entry, id: "fresh-payment" }], paymentNextCursor: null };
    expect(render(refreshed).payments[0].id).toBe("fresh-payment");
    resolve(page());
    await pending;
    expect(render(refreshed)).toMatchObject({ payments: refreshed.payments, nextCursor: null, error: "", loading: false });
  });

  it("does not attach an old request's error to a refreshed record", async () => {
    let reject!: (error: Error) => void;
    fetchMock.mockReturnValue(new Promise<Response>((_, fail) => { reject = fail; }));
    const pending = render().loadMore();
    const refreshed = { ...client, payments: [] };
    render(refreshed);
    reject(new Error("offline"));
    await pending;
    expect(render(refreshed)).toMatchObject({ payments: [], loading: false, error: "" });
  });
});
