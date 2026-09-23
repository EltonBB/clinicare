import type { ClientRecord } from "@/lib/clients";

export type ClientRecordState = { source: ClientRecord; client: ClientRecord };

export function olderClientRecord(incoming: ClientRecord, current: ClientRecord): boolean {
  return Boolean(
    incoming.readGeneration &&
    current.readGeneration &&
    BigInt(incoming.readGeneration) < BigInt(current.readGeneration)
  );
}

export function reconcileIncomingClient(
  state: ClientRecordState,
  incoming: ClientRecord,
  mutationPending: boolean
): ClientRecordState {
  if (mutationPending || state.source === incoming || olderClientRecord(incoming, state.client)) return state;
  return { source: incoming, client: incoming };
}
