import type { Prisma } from "@prisma/client";

/**
 * A client the clinic still contacts and books: not archived (either flag, see
 * formatStatus in lib/clients.ts) and not marked inactive. The waiting list, its
 * slot offers and the rebooking nudges all draw the line here, and it has to be
 * ONE definition — where the matcher, the offer's liveness check and the
 * waiting-list add each spelled it out, they disagreed twice: a slot offered to
 * an inactive client was stale the moment it was drafted (so the sweep looped
 * on it), and an inactive client could be put on the list yet never matched
 * (Codex #130).
 */
export const ELIGIBLE_CLIENT_WHERE: Prisma.ClientWhereInput = {
  isArchived: false,
  status: { notIn: ["INACTIVE", "ARCHIVED"] },
};

/**
 * Exactly the clients ELIGIBLE_CLIENT_WHERE leaves out — derived, so the two can
 * never drift apart. (Both columns are non-null, so NOT is a clean complement.)
 */
export const INELIGIBLE_CLIENT_WHERE: Prisma.ClientWhereInput = { NOT: ELIGIBLE_CLIENT_WHERE };
