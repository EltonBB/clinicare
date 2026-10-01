"use client";

import { useState } from "react";
import type { ClientRecord } from "@/lib/clients";
import type { buildPaymentPage } from "@/lib/client-payments";

function initialHistory(client: ClientRecord) {
  return {
    source: client,
    payments: client.payments,
    nextCursor: client.paymentNextCursor,
    loading: false,
    error: "",
  };
}

export function useClientPaymentHistory(client: ClientRecord) {
  const [history, setHistory] = useState(() => initialHistory(client));
  // A mutation returns a new record. Reset its pages together, before rendering
  // children, and reject any response belonging to the previous record below.
  if (history.source !== client) setHistory(initialHistory(client));

  async function loadMore() {
    const cursor = history.nextCursor;
    if (history.loading || !cursor) return;
    setHistory((current) => ({ ...current, loading: true, error: "" }));
    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(client.id)}/payments?cursor=${encodeURIComponent(JSON.stringify(cursor))}`, {
        cache: "no-store", signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error("Payment history unavailable");
      const page: ReturnType<typeof buildPaymentPage> = await response.json();
      setHistory((current) => current.source === client && current.nextCursor === cursor ? {
        ...current,
        payments: [...current.payments, ...page.payments],
        nextCursor: page.nextCursor,
        loading: false,
      } : current);
    } catch {
      setHistory((current) => current.source === client && current.nextCursor === cursor ? {
        ...current, loading: false, error: "We couldn't load more payments. Please try again.",
      } : current);
    }
  }

  return { ...history, loadMore };
}
