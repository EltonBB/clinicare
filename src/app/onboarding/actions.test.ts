import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const business = { upsert: vi.fn() };
  const whatsAppConnection = { findUnique: vi.fn(), upsert: vi.fn() };
  const businessHours = { upsert: vi.fn() };
  const staffMember = { findFirst: vi.fn(), create: vi.fn() };
  const reminderSettings = { upsert: vi.fn() };
  const $transaction = vi.fn();
  const getCurrentUser = vi.fn();
  const updateCurrentUserMetadata = vi.fn();
  const revalidatePath = vi.fn();
  return {
    business,
    whatsAppConnection,
    businessHours,
    staffMember,
    reminderSettings,
    $transaction,
    getCurrentUser,
    updateCurrentUserMetadata,
    revalidatePath,
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    business: mocks.business,
    whatsAppConnection: mocks.whatsAppConnection,
    businessHours: mocks.businessHours,
    staffMember: mocks.staffMember,
    reminderSettings: mocks.reminderSettings,
    $transaction: mocks.$transaction,
  },
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: mocks.getCurrentUser,
  updateCurrentUserMetadata: mocks.updateCurrentUserMetadata,
}));

import { saveOnboardingStateAction } from "./actions";
import { createDefaultOnboardingState } from "@/lib/onboarding";

const USER = { id: "user_1", email: "owner@clinic.example", user_metadata: {} };

function completedState() {
  const state = createDefaultOnboardingState();
  return {
    ...state,
    completed: true,
    owner: { ...state.owner, name: "Leo" },
    clinic: { ...state.clinic, name: "Vela Dent", logoUrl: "" },
    staffMember: { ...state.staffMember, name: "Dr. Lee", role: "Dentist" },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue(USER);
  mocks.updateCurrentUserMetadata.mockResolvedValue({ error: false });
  mocks.whatsAppConnection.findUnique.mockResolvedValue(null);
  mocks.staffMember.findFirst.mockResolvedValue(null);
  mocks.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({
      business: { upsert: vi.fn().mockResolvedValue({ id: "biz_1" }) },
      whatsAppConnection: mocks.whatsAppConnection,
      businessHours: mocks.businessHours,
      staffMember: mocks.staffMember,
      reminderSettings: mocks.reminderSettings,
    })
  );
});

describe("saveOnboardingStateAction — workspace-shell revalidation", () => {
  it("revalidates the shell, onboarding, and dashboard once bootstrap creates the workspace", async () => {
    const result = await saveOnboardingStateAction(completedState());

    expect(result.ok).toBe(true);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/onboarding");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("does not revalidate anything if bootstrap itself fails", async () => {
    mocks.$transaction.mockRejectedValue(new Error("db unreachable"));

    const result = await saveOnboardingStateAction(completedState());

    expect(result).toEqual({
      ok: false,
      error: "We couldn't create your clinic workspace. Try again.",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("does not run bootstrap or revalidate on a mid-flow save that isn't completed yet", async () => {
    const state = createDefaultOnboardingState();

    const result = await saveOnboardingStateAction({ ...state, completed: false });

    expect(result.ok).toBe(true);
    expect(mocks.$transaction).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
