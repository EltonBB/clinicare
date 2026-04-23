"use server";

import { revalidatePath } from "next/cache";

import { requireCurrentBusiness } from "@/lib/business";
import { prisma } from "@/lib/prisma";
import {
  buildStaffRecord,
  staffStatuses,
  type SaveStaffPayload,
  type StaffRecord,
} from "@/lib/staff";
import { createClient } from "@/utils/supabase/server";

export type SaveStaffResult = {
  ok: boolean;
  error?: string;
  staff?: StaffRecord;
};

export type DeleteStaffResult = {
  ok: boolean;
  error?: string;
  staffId?: string;
};

export type StaffClockResult = {
  ok: boolean;
  error?: string;
  staff?: StaffRecord;
};

function staffTimeEntryCutoff() {
  return new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
}

async function getAuthedBusiness() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: "Your session expired. Log in again to manage staff.",
    } as const;
  }

  const business = await requireCurrentBusiness(user, {
    missingBusinessRedirect: "/onboarding",
  });

  return { business } as const;
}

async function fetchStaffRecord(staffId: string, businessId: string) {
  const staff = await prisma.staffMember.findFirstOrThrow({
    where: {
      id: staffId,
      businessId,
    },
    include: {
      timeEntries: {
        where: {
          checkedInAt: {
            gte: staffTimeEntryCutoff(),
          },
        },
        orderBy: {
          checkedInAt: "desc",
        },
      },
      appointments: {
        where: {
          status: "COMPLETED",
        },
        include: {
          client: {
            select: {
              name: true,
            },
          },
        },
        orderBy: {
          startAt: "desc",
        },
      },
    },
  });

  return buildStaffRecord(staff);
}

function revalidateStaffSurfaces() {
  revalidatePath("/staff");
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  revalidatePath("/settings");
}

export async function saveStaffAction(payload: SaveStaffPayload): Promise<SaveStaffResult> {
  const context = await getAuthedBusiness();

  if ("error" in context) {
    return {
      ok: false,
      error: context.error,
    };
  }

  const business = context.business;
  const name = payload.name.trim();

  if (!name) {
    return {
      ok: false,
      error: "Staff name is required.",
    };
  }

  const status = staffStatuses.includes(payload.status) ? payload.status : "ACTIVE";
  const data = {
    name,
    role: payload.role.trim() || "Specialist",
    email: payload.email.trim() || null,
    phone: payload.phone.trim() || null,
    profileNote: payload.profileNote.trim() || null,
    status,
    isActive: status !== "INACTIVE",
  };

  let staffId = payload.id;

  if (payload.id) {
    const existing = await prisma.staffMember.findFirst({
      where: {
        id: payload.id,
        businessId: business.id,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      return {
        ok: false,
        error: "Staff member not found in this workspace.",
      };
    }

    await prisma.staffMember.update({
      where: {
        id: payload.id,
      },
      data,
    });
  } else {
    const created = await prisma.staffMember.create({
      data: {
        businessId: business.id,
        ...data,
      },
    });
    staffId = created.id;
  }

  revalidateStaffSurfaces();

  return {
    ok: true,
    staff: await fetchStaffRecord(staffId!, business.id),
  };
}

export async function deleteStaffAction(staffId: string): Promise<DeleteStaffResult> {
  const context = await getAuthedBusiness();

  if ("error" in context) {
    return {
      ok: false,
      error: context.error,
    };
  }

  const business = context.business;
  const existing = await prisma.staffMember.findFirst({
    where: {
      id: staffId,
      businessId: business.id,
    },
    select: {
      id: true,
    },
  });

  if (!existing) {
    return {
      ok: false,
      error: "Staff member not found in this workspace.",
    };
  }

  await prisma.staffMember.delete({
    where: {
      id: staffId,
    },
  });

  revalidateStaffSurfaces();

  return {
    ok: true,
    staffId,
  };
}

export async function checkInStaffAction(staffId: string): Promise<StaffClockResult> {
  const context = await getAuthedBusiness();

  if ("error" in context) {
    return {
      ok: false,
      error: context.error,
    };
  }

  const business = context.business;
  const staff = await prisma.staffMember.findFirst({
    where: {
      id: staffId,
      businessId: business.id,
    },
    select: {
      id: true,
    },
  });

  if (!staff) {
    return {
      ok: false,
      error: "Staff member not found in this workspace.",
    };
  }

  const openEntry = await prisma.staffTimeEntry.findFirst({
    where: {
      businessId: business.id,
      staffMemberId: staffId,
      checkedOutAt: null,
    },
  });

  if (!openEntry) {
    await prisma.staffTimeEntry.create({
      data: {
        businessId: business.id,
        staffMemberId: staffId,
        checkedInAt: new Date(),
      },
    });
  }

  revalidatePath("/staff");

  return {
    ok: true,
    staff: await fetchStaffRecord(staffId, business.id),
  };
}

export async function checkOutStaffAction(staffId: string): Promise<StaffClockResult> {
  const context = await getAuthedBusiness();

  if ("error" in context) {
    return {
      ok: false,
      error: context.error,
    };
  }

  const business = context.business;
  const openEntry = await prisma.staffTimeEntry.findFirst({
    where: {
      businessId: business.id,
      staffMemberId: staffId,
      checkedOutAt: null,
    },
    orderBy: {
      checkedInAt: "desc",
    },
  });

  if (!openEntry) {
    return {
      ok: false,
      error: "This staff member is not checked in.",
    };
  }

  await prisma.staffTimeEntry.update({
    where: {
      id: openEntry.id,
    },
    data: {
      checkedOutAt: new Date(),
    },
  });

  revalidatePath("/staff");

  return {
    ok: true,
    staff: await fetchStaffRecord(staffId, business.id),
  };
}
