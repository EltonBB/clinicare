import type { AutomationKind, FollowUpDraftKind } from "@prisma/client";

import { automationDefinition, renderAutomationMessage } from "@/lib/automations";
import { AUTOMATION_SETTINGS_SELECT, automationSettingsFromBusiness, getAutomationSettings } from "@/lib/automations-data";
import { dispatchSoon } from "@/lib/automation-dispatch-soon";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { formatZonedFullDate, formatZonedTime } from "@/lib/time-zone";

const HOUR_MS = 3_600_000;

export type VisitEvent = "booked" | "moved" | "cancelled";

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "P2002";
}

/**
 * Drafts the patient message for something the clinic just did to a visit —
 * a booking (a first-ever booking gets the welcome instead of the
 * confirmation), a new time, or a cancellation — and, when the clinic set that
 * automation to send on its own, sends it right after this request.
 *
 * Call it after the change has committed, and only for changes the clinic made
 * (a patient who cancels by replying already gets the reply acknowledgement).
 * Nothing is drafted for a visit whose time has passed, when the automation is
 * off or not in the plan, or when WhatsApp isn't linked. Never throws: the
 * booking itself has already been saved, and a message is not worth failing it.
 */
export async function queueVisitMessage(args: {
  businessId: string;
  appointmentId: string;
  event: VisitEvent;
  now?: Date;
}): Promise<string | null> {
  const { businessId, appointmentId, event, now = new Date() } = args;

  try {
    const appointment = await prisma.appointment.findFirst({
      where: { id: appointmentId, businessId },
      select: {
        id: true,
        clientId: true,
        status: true,
        startAt: true,
        reminderGeneration: true,
        client: { select: { name: true } },
        staffMember: { select: { name: true } },
        business: {
          select: {
            name: true,
            whatsappEnabled: true,
            whatsappConnection: { select: { status: true } },
            ...AUTOMATION_SETTINGS_SELECT,
          },
        },
      },
    });
    if (!appointment || appointment.startAt.getTime() <= now.getTime()) return null;

    const business = appointment.business;
    const linked =
      business.whatsappEnabled &&
      (business.whatsappConnection?.status === "CONNECTED" || business.whatsappConnection?.status === "ERRORED");
    if (!linked) return null;

    const cancelled = appointment.status === "CANCELLED";
    if ((event === "cancelled") !== cancelled) return null;

    let kind: AutomationKind & FollowUpDraftKind;
    if (event === "booked") {
      const earlierVisits = await prisma.appointment.count({
        where: { businessId, clientId: appointment.clientId, id: { not: appointment.id }, status: { not: "CANCELLED" } },
      });
      kind = earlierVisits === 0 ? "NEW_PATIENT_WELCOME" : "BOOKING_CONFIRMATION";
    } else {
      kind = "VISIT_CHANGED";
    }

    const setting = automationSettingsFromBusiness(business)[kind];
    if (!setting.enabled) return null;

    const variant = event === "cancelled" ? "cancelled" : "moved";
    const body = renderAutomationMessage(
      kind,
      variant === "cancelled" ? setting.template2 : setting.template,
      {
        client_name: appointment.client.name,
        date: formatZonedFullDate(appointment.startAt),
        time: formatZonedTime(appointment.startAt),
        staff_name: appointment.staffMember?.name ?? business.name,
        clinic_name: business.name,
      },
      variant
    );
    const autoSend = setting.mode === "AUTOMATIC";

    if (kind === "VISIT_CHANGED") {
      // A newer change replaces any notice about the visit still waiting to go
      // out, so the patient only ever hears where the visit stands now.
      await prisma.followUpDraft.updateMany({
        where: { businessId, appointmentId: appointment.id, kind: "VISIT_CHANGED", status: "PENDING" },
        data: { status: "DISMISSED" },
      });
    }

    const draft = await prisma.followUpDraft.create({
      data: {
        businessId,
        clientId: appointment.clientId,
        kind,
        status: "PENDING",
        appointmentId: appointment.id,
        body,
        autoSend,
        dedupeKey:
          kind === "VISIT_CHANGED"
            ? `${kind}:${appointment.id}:${variant}:${appointment.startAt.getTime()}:${appointment.reminderGeneration}`
            : `${kind}:${appointment.id}`,
      },
      select: { id: true },
    });

    if (autoSend) dispatchSoon(businessId);
    return draft.id;
  } catch (error) {
    if (isUniqueViolation(error)) return null;
    logger.error("Drafting a visit message failed.", error, { businessId, appointmentId, event });
    return null;
  }
}

/**
 * Drafts the "we missed you" message when a visit is recorded as a no-show,
 * to go out after the clinic's delay (`sendAfter`). Undoing the no-show
 * withdraws it (withdrawMissedVisitMessage). Never throws, like queueVisitMessage.
 */
export async function queueMissedVisitMessage(args: {
  businessId: string;
  appointmentId: string;
  now?: Date;
}): Promise<string | null> {
  const { businessId, appointmentId, now = new Date() } = args;

  try {
    const appointment = await prisma.appointment.findFirst({
      where: { id: appointmentId, businessId, status: "NO_SHOW" },
      select: {
        id: true,
        clientId: true,
        startAt: true,
        client: { select: { name: true } },
        business: {
          select: {
            name: true,
            whatsappEnabled: true,
            whatsappConnection: { select: { status: true } },
            ...AUTOMATION_SETTINGS_SELECT,
          },
        },
      },
    });
    if (!appointment) return null;

    const business = appointment.business;
    const linked =
      business.whatsappEnabled &&
      (business.whatsappConnection?.status === "CONNECTED" || business.whatsappConnection?.status === "ERRORED");
    if (!linked) return null;

    const setting = automationSettingsFromBusiness(business).MISSED_VISIT;
    if (!setting.enabled) return null;

    const delayHours = setting.timing ?? automationDefinition("MISSED_VISIT").defaultTiming ?? 1;
    const draft = await prisma.followUpDraft.create({
      data: {
        businessId,
        clientId: appointment.clientId,
        kind: "MISSED_VISIT",
        status: "PENDING",
        appointmentId: appointment.id,
        body: renderAutomationMessage("MISSED_VISIT", setting.template, {
          client_name: appointment.client.name,
          clinic_name: business.name,
        }),
        autoSend: setting.mode === "AUTOMATIC",
        sendAfter: new Date(now.getTime() + delayHours * HOUR_MS),
        dedupeKey: `MISSED_VISIT:${appointment.id}`,
      },
      select: { id: true },
    });
    return draft.id;
  } catch (error) {
    if (isUniqueViolation(error)) return null;
    logger.error("Drafting a missed-visit message failed.", error, { businessId, appointmentId });
    return null;
  }
}

/** The no-show was undone ("Mark as attended"): a missed-visit message still waiting no longer applies. */
export async function withdrawMissedVisitMessage(args: { businessId: string; appointmentId: string }): Promise<void> {
  try {
    await prisma.followUpDraft.updateMany({
      where: { ...args, kind: "MISSED_VISIT", status: "PENDING" },
      data: { status: "DISMISSED" },
    });
  } catch (error) {
    logger.error("Withdrawing a missed-visit message failed.", error, args);
  }
}

/**
 * One message per event: once a booking confirmation, welcome or new-time
 * notice has gone out, the reminders whose window was already open are
 * recorded as sent without sending — the patient was just told the time, so a
 * reminder minutes later would be a second message about the same thing.
 * Reminders whose window opens later still go out as usual.
 */
export async function suppressOpenReminders(args: { businessId: string; appointmentId: string; now?: Date }): Promise<void> {
  const { businessId, appointmentId, now = new Date() } = args;

  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, businessId, status: { in: ["PENDING", "CONFIRMED"] } },
    select: { startAt: true },
  });
  if (!appointment) return;

  const settings = await getAutomationSettings(businessId);
  const reminders = [
    { type: "TWENTY_FOUR_HOUR", setting: settings.FIRST_REMINDER },
    { type: "TWO_HOUR", setting: settings.SECOND_REMINDER },
    { type: "HIGH_RISK", setting: settings.HIGH_RISK_REMINDER },
  ] as const;
  const open = reminders.filter(
    ({ setting }) =>
      setting.enabled &&
      setting.timing !== null &&
      appointment.startAt.getTime() <= now.getTime() + setting.timing * HOUR_MS
  );
  if (open.length === 0) return;

  await prisma.appointmentReminder.createMany({
    data: open.map(({ type }) => ({ appointmentId, type, status: "SENT" as const, sentAt: now })),
    skipDuplicates: true,
  });
}
