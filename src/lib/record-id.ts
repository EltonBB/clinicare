import { z } from "zod";

// A server action's arguments come from the client, so a parameter typed
// `id: string` can arrive as anything serializable. An object like
// `{ not: "" }` that reaches `where: { id, businessId }` is a Prisma filter,
// not an equality match — one crafted call would then update or delete every
// matching row in the caller's workspace. Parse every client-supplied record
// id with this before it reaches a query.
export const recordIdSchema = z.string().trim().min(1).max(100);

/** The id as a plain non-empty string, or null when it isn't one. */
export function parseRecordId(value: unknown): string | null {
  const parsed = recordIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
