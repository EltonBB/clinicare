import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const client = { findFirst: vi.fn() };
  const staffMember = { findFirst: vi.fn() };
  const getAuthedBusiness = vi.fn();
  const createWaitlistEntry = vi.fn();
  const removeWaitlistEntry = vi.fn();
  const revalidatePath = vi.fn();
  const loggerError = vi.fn();
  return {
    loggerError,
    client,
    staffMember,
    getAuthedBusiness,
    createWaitlistEntry,
    removeWaitlistEntry,
    revalidatePath,
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    client: mocks.client,
    staffMember: mocks.staffMember,
  },
}));

vi.mock("@/lib/business", () => ({
  getAuthedBusiness: mocks.getAuthedBusiness,
}));

vi.mock("@/lib/waitlist-data", () => ({
  createWaitlistEntry: mocks.createWaitlistEntry,
}));

vi.mock("@/lib/slot-offers", () => ({
  removeWaitlistEntry: mocks.removeWaitlistEntry,
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

vi.mock("@/lib/logger", () => ({ logger: { error: mocks.loggerError, warn: vi.fn(), info: vi.fn() } }));

import {
  addWaitlistEntryAction,
  removeWaitlistEntryAction,
  type AddWaitlistEntryPayload,
} from "./waitlist-actions";
import { WAITLIST_ENTRY_REMOVED_ERROR, WAITLIST_PLAN_ERROR, WAITLIST_TIME_RANGE_ERROR } from "@/lib/waitlist";

const PRO_BUSINESS = { id: "biz_1", plan: "PRO" as const };
const BASIC_BUSINESS = { id: "biz_1", plan: "BASIC" as const };

const VALID_PAYLOAD: AddWaitlistEntryPayload = {
  clientId: "client_1",
  service: "Cleaning",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthedBusiness.mockResolvedValue({ business: PRO_BUSINESS, user: {} });
  mocks.client.findFirst.mockResolvedValue({ id: "client_1" });
  mocks.staffMember.findFirst.mockResolvedValue({ id: "staff_1" });
  mocks.createWaitlistEntry.mockResolvedValue({ ok: true });
  mocks.removeWaitlistEntry.mockResolvedValue({ ok: true });
});

describe("addWaitlistEntryAction — Pro gate", () => {
  it("refuses a Basic workspace without touching the data layer", async () => {
    mocks.getAuthedBusiness.mockResolvedValue({ business: BASIC_BUSINESS, user: {} });

    const result = await addWaitlistEntryAction(VALID_PAYLOAD);

    expect(result).toEqual({ ok: false, error: WAITLIST_PLAN_ERROR });
    expect(mocks.createWaitlistEntry).not.toHaveBeenCalled();
    expect(mocks.client.findFirst).not.toHaveBeenCalled();
  });
});

describe("removeWaitlistEntryAction — Pro gate", () => {
  it("refuses a Basic workspace without touching the data layer", async () => {
    mocks.getAuthedBusiness.mockResolvedValue({ business: BASIC_BUSINESS, user: {} });

    const result = await removeWaitlistEntryAction("entry_1");

    expect(result).toEqual({ ok: false, error: WAITLIST_PLAN_ERROR });
    expect(mocks.removeWaitlistEntry).not.toHaveBeenCalled();
  });
});

describe("addWaitlistEntryAction — successful add", () => {
  it("creates an entry, passing omitted optional fields through as null (not undefined)", async () => {
    const result = await addWaitlistEntryAction(VALID_PAYLOAD);

    expect(result).toEqual({ ok: true });
    expect(mocks.createWaitlistEntry).toHaveBeenCalledWith({
      businessId: "biz_1",
      clientId: "client_1",
      service: "Cleaning",
      staffMemberId: null,
      earliestDate: null,
      preferredDays: [],
      preferredFrom: null,
      preferredTo: null,
      notes: null,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/calendar");
  });

  it("trims stray whitespace off the service before storing it, so matching never depends on it", async () => {
    const result = await addWaitlistEntryAction({ ...VALID_PAYLOAD, service: "  Deep cleaning \t" });

    expect(result).toEqual({ ok: true });
    expect(mocks.createWaitlistEntry).toHaveBeenCalledWith(expect.objectContaining({ service: "Deep cleaning" }));
  });

  it("refuses a service that is only whitespace, writing nothing", async () => {
    const result = await addWaitlistEntryAction({ ...VALID_PAYLOAD, service: "   " });

    expect(result.ok).toBe(false);
    expect(mocks.createWaitlistEntry).not.toHaveBeenCalled();
  });

  it("passes every optional field through when provided", async () => {
    mocks.staffMember.findFirst.mockResolvedValue({ id: "staff_1" });

    const result = await addWaitlistEntryAction({
      clientId: "client_1",
      service: "Cleaning",
      staffMemberId: "staff_1",
      earliestDate: "2026-10-01",
      preferredDays: [0, 2, 4],
      preferredFrom: "09:00",
      preferredTo: "12:00",
      notes: "Prefers mornings",
    });

    expect(result).toEqual({ ok: true });
    expect(mocks.createWaitlistEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        staffMemberId: "staff_1",
        preferredDays: [0, 2, 4],
        preferredFrom: "09:00",
        preferredTo: "12:00",
        notes: "Prefers mornings",
        earliestDate: expect.any(Date),
      })
    );
  });

  it.each([
    ["later than", "14:00", "09:00"],
    ["equal to", "09:00", "09:00"],
  ])("rejects a From time %s the To time, with a specific message, before touching the database", async (_label, from, to) => {
    const result = await addWaitlistEntryAction({ ...VALID_PAYLOAD, preferredFrom: from, preferredTo: to });

    expect(result).toEqual({ ok: false, error: WAITLIST_TIME_RANGE_ERROR });
    expect(mocks.client.findFirst).not.toHaveBeenCalled();
    expect(mocks.createWaitlistEntry).not.toHaveBeenCalled();
  });

  it("accepts a one-sided window (only From or only To set)", async () => {
    expect(await addWaitlistEntryAction({ ...VALID_PAYLOAD, preferredFrom: "14:00" })).toEqual({ ok: true });
    expect(await addWaitlistEntryAction({ ...VALID_PAYLOAD, preferredTo: "09:00" })).toEqual({ ok: true });
  });

  it("rejects a payload missing a required field before touching the database", async () => {
    const result = await addWaitlistEntryAction({ clientId: "", service: "" });

    expect(result.ok).toBe(false);
    expect(mocks.client.findFirst).not.toHaveBeenCalled();
    expect(mocks.createWaitlistEntry).not.toHaveBeenCalled();
  });

  it("refuses a client that doesn't belong to this business", async () => {
    mocks.client.findFirst.mockResolvedValue(null);

    const result = await addWaitlistEntryAction(VALID_PAYLOAD);

    expect(result).toEqual({
      ok: false,
      error: "The selected client does not belong to this clinic workspace.",
    });
    expect(mocks.createWaitlistEntry).not.toHaveBeenCalled();
  });

  it("refuses a staff member that doesn't belong to this business", async () => {
    mocks.staffMember.findFirst.mockResolvedValue(null);

    const result = await addWaitlistEntryAction({ ...VALID_PAYLOAD, staffMemberId: "staff_1" });

    expect(result).toEqual({
      ok: false,
      error: "The selected staff member does not belong to this clinic workspace.",
    });
    expect(mocks.createWaitlistEntry).not.toHaveBeenCalled();
  });
});

describe("removeWaitlistEntryAction — successful remove", () => {
  it("removes the entry for this business and revalidates the calendar and the follow-ups surfaces", async () => {
    const result = await removeWaitlistEntryAction("entry_1");

    expect(result).toEqual({ ok: true });
    expect(mocks.removeWaitlistEntry).toHaveBeenCalledWith({ id: "entry_1", businessId: "biz_1" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/calendar");
    // An entry holding an offer drops out of the Follow-ups list/count.
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/inbox");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/inbox/follow-ups");
  });

  it("turns an unexpected failure (e.g. a deadlock that survived its retry) into a plain retry message, logging ids only", async () => {
    mocks.removeWaitlistEntry.mockRejectedValue(new Error("deadlock detected"));

    const result = await removeWaitlistEntryAction("entry_1");

    expect(result).toEqual({ ok: false, error: "Couldn't remove this entry. Try again." });
    expect(mocks.loggerError).toHaveBeenCalledWith(expect.any(String), expect.any(Error), {
      businessId: "biz_1",
      waitlistEntryId: "entry_1",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces the data layer's 'already removed' error unchanged", async () => {
    mocks.removeWaitlistEntry.mockResolvedValue({
      ok: false,
      error: "This waiting-list entry was already removed.",
    });

    const result = await removeWaitlistEntryAction("entry_1");

    expect(result).toEqual({
      ok: false,
      error: "This waiting-list entry was already removed.",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("removeWaitlistEntryAction — crafted id", () => {
  it("refuses a non-string id (which would remove the whole waiting list) before touching the data layer", async () => {
    const result = await removeWaitlistEntryAction({ not: "" } as unknown as string);

    expect(result).toEqual({ ok: false, error: WAITLIST_ENTRY_REMOVED_ERROR });
    expect(mocks.removeWaitlistEntry).not.toHaveBeenCalled();
    expect(mocks.client.findFirst).not.toHaveBeenCalled();
    expect(mocks.staffMember.findFirst).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
