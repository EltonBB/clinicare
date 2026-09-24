import type { ClientRecord } from "@/lib/clients";

export type ClientRecordState = { source: ClientRecord; client: ClientRecord };

function parseSnapshot(value: string) {
  const [, xmax, inProgress] = value.split(":");
  return { xmax: BigInt(xmax), inProgress: new Set(inProgress ? inProgress.split(",") : []) };
}

export function olderClientRecord(incoming: ClientRecord, current: ClientRecord): boolean {
  if (!incoming.readSnapshot || !current.readSnapshot) return false;
  const older = parseSnapshot(incoming.readSnapshot);
  const newer = parseSnapshot(current.readSnapshot);
  if (older.xmax !== newer.xmax) return older.xmax < newer.xmax;
  // With the same xmax, a commit removes its ID from the in-progress set.
  return [...older.inProgress].some((id) => !newer.inProgress.has(id));
}

export function reconcileIncomingClient(
  state: ClientRecordState,
  incoming: ClientRecord,
  mutationPending: boolean
): ClientRecordState {
  if (mutationPending || state.source === incoming || olderClientRecord(incoming, state.client)) return state;
  return { source: incoming, client: incoming };
}
