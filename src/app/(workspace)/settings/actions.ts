"use server";

import { prisma } from "@/lib/prisma";
import { requireCurrentBusiness } from "@/lib/business";
import { createClient } from "@/utils/supabase/server";
import {
  buildSettingsStateFromWorkspace,
  type SaveSettingsPayload,
  type SettingsState,
} from "@/lib/settings";
import { weekdayOrder } from "@/lib/onboarding";

export type SaveSettingsResult = {
  ok: boolean;
  error?: string;
  state?: SettingsState;
};

export async function saveSettingsAction(
  payload: SaveSettingsPayload
): Promise<SaveSettingsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      error: "Your session expired. Log in again to update settings.",
    };
  }

  const business = await requireCurrentBusiness(user, {
    missingBusinessRedirect: "/onboarding",
  });

  const cleanedStaff = payload.staff.filter((member) => member.name.trim().length > 0);
  const persistedStaff =
    cleanedStaff.length > 0
      ? cleanedStaff
      : [
          {
            id: "owner-seed",
            name: payload.business.ownerName.trim() || user.email || "Workspace Owner",
            role: "Owner" as const,
          },
        ];

  await prisma.$transaction(async (tx) => {
    await tx.business.update({
      where: {
        id: business.id,
      },
      data: {
        name: payload.business.businessName.trim() || business.name,
        businessType: payload.business.businessType,
        whatsappNumber: payload.whatsapp.phoneNumber.trim() || null,
        whatsappEnabled: payload.whatsapp.sendReminders,
      },
    });

    for (const [index, day] of weekdayOrder.entries()) {
      const schedule = payload.workingHours[day];

      await tx.businessHours.upsert({
        where: {
          businessId_weekday: {
            businessId: business.id,
            weekday: index,
          },
        },
        update: {
          isOpen: schedule.enabled,
          startTime: schedule.start,
          endTime: schedule.end,
        },
        create: {
          businessId: business.id,
          weekday: index,
          isOpen: schedule.enabled,
          startTime: schedule.start,
          endTime: schedule.end,
        },
      });
    }

    const existingStaff = await tx.staffMember.findMany({
      where: {
        businessId: business.id,
      },
      select: {
        id: true,
      },
    });

    const existingIds = new Set(existingStaff.map((member) => member.id));
    const submittedIds = new Set(
      persistedStaff
        .map((member) => member.id)
        .filter((id) => existingIds.has(id))
    );

    const idsToDelete = existingStaff
      .map((member) => member.id)
      .filter((id) => !submittedIds.has(id));

    if (idsToDelete.length > 0) {
      await tx.staffMember.deleteMany({
        where: {
          businessId: business.id,
          id: {
            in: idsToDelete,
          },
        },
      });
    }

    for (const member of persistedStaff) {
      if (existingIds.has(member.id)) {
        await tx.staffMember.update({
          where: {
            id: member.id,
          },
          data: {
            name: member.name.trim(),
            role: member.role,
          },
        });
      } else {
        await tx.staffMember.create({
          data: {
            businessId: business.id,
            name: member.name.trim(),
            role: member.role,
          },
        });
      }
    }

    await tx.reminderSettings.upsert({
      where: {
        businessId: business.id,
      },
      update: {
        send24HourReminder: payload.reminders.twentyFourHour,
        send2HourReminder: payload.reminders.twoHour,
        reminderWindow: payload.whatsapp.reminderWindow,
        template: payload.reminders.template,
      },
      create: {
        businessId: business.id,
        send24HourReminder: payload.reminders.twentyFourHour,
        send2HourReminder: payload.reminders.twoHour,
        reminderWindow: payload.whatsapp.reminderWindow,
        template: payload.reminders.template,
      },
    });
  });

  const nextMetadata = {
    ...(user.user_metadata ?? {}),
    full_name: payload.business.ownerName,
  };

  const { error } = await supabase.auth.updateUser({
    data: nextMetadata,
  });

  if (error) {
    return {
      ok: false,
      error: error.message,
    };
  }

  const [updatedBusiness, businessHours, staffMembers, reminderSettings] = await Promise.all([
    prisma.business.findUniqueOrThrow({
      where: {
        id: business.id,
      },
    }),
    prisma.businessHours.findMany({
      where: {
        businessId: business.id,
      },
      orderBy: {
        weekday: "asc",
      },
    }),
    prisma.staffMember.findMany({
      where: {
        businessId: business.id,
      },
      orderBy: {
        createdAt: "asc",
      },
    }),
    prisma.reminderSettings.findUnique({
      where: {
        businessId: business.id,
      },
    }),
  ]);

  const nextState: SettingsState = buildSettingsStateFromWorkspace({
    business: updatedBusiness,
    supportEmail: user.email ?? "",
    ownerName: payload.business.ownerName,
    businessHours,
    staffMembers,
    reminderSettings,
  });

  return {
    ok: true,
    state: nextState,
  };
}
