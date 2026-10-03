import type { Prisma } from "@prisma/client";

/**
 * A staff member the clinic can still book into: marked active and not set to
 * Inactive. The waiting list, its slot offers and the Book link all draw the
 * line here, and it has to be ONE definition — the same way
 * ELIGIBLE_CLIENT_WHERE is for clients. Where the offer's liveness check, the
 * waiting-list add, the panel query and Book each spelled it out, a new
 * surface that forgot the rule was the next review finding every round
 * (Codex #130).
 */
export const AVAILABLE_STAFF_WHERE: Prisma.StaffMemberWhereInput = {
  isActive: true,
  status: { not: "INACTIVE" },
};

/**
 * An appointment that either never had a staff member or whose staff member is
 * still available — the "this freed slot can still be honored" half of a live
 * slot offer.
 */
export const APPOINTMENT_STAFF_AVAILABLE_WHERE: Prisma.AppointmentWhereInput = {
  OR: [{ staffMemberId: null }, { staffMember: AVAILABLE_STAFF_WHERE }],
};

/**
 * Exactly the appointments APPOINTMENT_STAFF_AVAILABLE_WHERE leaves out: an
 * assigned staff member who is no longer available. Written out with the
 * explicit "has a staff member" half (rather than negating the OR above) so a
 * NULL staffMemberId can never fall through SQL's three-valued NOT.
 */
export const APPOINTMENT_STAFF_UNAVAILABLE_WHERE: Prisma.AppointmentWhereInput = {
  staffMemberId: { not: null },
  NOT: { staffMember: AVAILABLE_STAFF_WHERE },
};
