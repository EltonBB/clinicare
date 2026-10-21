import type { AutomationKind, FollowUpDraftKind, Prisma } from "@prisma/client";

import { automationDefinition, renderAutomationMessage } from "@/lib/automations";
import { AUTOMATION_SETTINGS_SELECT, automationSettingsFromBusiness, getAutomationSettings } from "@/lib/automations-data";
import { dispatchSoon } from "@/lib/automation-dispatch-soon";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { lockAppointmentShared } from "@/lib/row-locks";
import { formatZonedFullDate, formatZonedTime } from "@/lib/time-zone";

const HOUR_MS = 3_600_000;

export type VisitEvent = "booked" | "moved" | "cancelled";

/**
 * Drafts written about a visit as it stood: its patient, time, staff member
 * and status are baked into them (Codex).
 */
const VISIT_DRAFT_KINDS: FollowUpDraftKind[] = ["BOOKING_CONFIRMATION", "NEW_PATIENT_WELCOME", "VISIT_CHANGED", "MISSED_VISIT"];

const BOOKING_MESSAGE_KINDS: FollowUpDraftKind[] = ["BOOKING_CONFIRMATION", "NEW_PATIENT_WELCOME"];

/**
 * What a save of the booking form tells the patient, if anything: a new
 * booking, a cancellation, or a new time. A visit given to another patient is
 * a new booking for them, whatever else changed, and so is a cancelled visit
 * restored: the patient was told it was cancelled (Codex). A booking message
 * still waiting when the save reset the visit is owed again too.
 */
export function visitEventForSave(save: {
  isNew: boolean;
  newStatus: string;
  wasNewlyCancelled: boolean;
  wasReactivated: boolean;
  timeChanged: boolean;
  clientChanged: boolean;
  bookingMessageRetired: boolean;
}): VisitEvent | null {
  const stands = save.newStatus === "PENDING" || save.newStatus === "CONFIRMED";
  if (save.isNew) return save.newStatus !== "CANCELLED" ? "booked" : null;
  if (save.wasNewlyCancelled) return "cancelled";
  if (stands && (save.clientChanged || save.wasReactivated)) return "booked";
  if (save.newStatus !== "CANCELLED" && save.timeChanged) return "moved";
  if (stands && save.bookingMessageRetired) return "booked";
  return null;
}

/**
 * Withdraws the pending drafts written about a visit, inside the transaction
 * that changes who, when or what it is (wherever its reminders are reset). An
 * edit could otherwise leave a confirmation that names the old time — or that
 * goes to the patient the visit no longer belongs to. The caller drafts the
 * notice for the new state after the commit (queueVisitMessage).
 */
export async function retireVisitDrafts(
  tx: Prisma.TransactionClient,
  appointmentId: string
): Promise<{ bookingMessageRetired: boolean }> {
  // Whether a confirmation or welcome was still waiting: the caller re-drafts
  // it for the visit as it now stands (an unsent confirmation is still owed,
  // say after a pending booking is confirmed — Codex).
  const waitingBookingMessages = await tx.followUpDraft.count({
    where: { appointmentId, status: "PENDING", kind: { in: BOOKING_MESSAGE_KINDS } },
  });
  await tx.followUpDraft.updateMany({
    where: { appointmentId, status: "PENDING", kind: { in: VISIT_DRAFT_KINDS } },
    data: { status: "DISMISSED" },
  });
  return { bookingMessageRetired: waitingBookingMessages > 0 };
}

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
  /** Internal: another booking already holds this patient's welcome, so this one gets the confirmation. */
  notNewPatient?: boolean;
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
        createdAt: true,
        reminderGeneration: true,
        client: { select: { name: true } },
        staffMember: { select: { name: true } },
        business: {
          select: {
            name: true,
            whatsappEnabled: true,
            ...AUTOMATION_SETTINGS_SELECT,
          },
        },
      },
    });
    if (!appointment || appointment.startAt.getTime() <= now.getTime()) return null;

    const business = appointment.business;
    // A clinic that set up WhatsApp gets the draft even while the link is down:
    // the event happens once, and the draft waits for the link to come back
    // (automatic sends need it; a draft over 3 days late goes to review). One
    // that never set WhatsApp up gets none (Codex).
    if (!business.whatsappEnabled) return null;

    // A cancel notice needs a cancelled visit; a booking or new time, one that
    // still stands (not a visit also marked completed or a no-show — Codex).
    const stands = appointment.status === "PENDING" || appointment.status === "CONFIRMED";
    if (event === "cancelled" ? appointment.status !== "CANCELLED" : !stands) return null;

    let kind: AutomationKind & FollowUpDraftKind;
    if (event === "booked") {
      // Only bookings made before this one count, by a stable order (creation
      // time, then id), so two first bookings saved at once agree on which one
      // is first: it gets the welcome, the other the confirmation (Codex). A
      // cancelled earlier booking counts too: its welcome may well have gone
      // out, and a patient is only new once.
      const earlierVisits = await prisma.appointment.count({
        where: {
          businessId,
          clientId: appointment.clientId,
          id: { not: appointment.id },
          OR: [
            { createdAt: { lt: appointment.createdAt } },
            { createdAt: appointment.createdAt, id: { lt: appointment.id } },
          ],
        },
      });
      // A welcome that went out stays on record even if the booking it was
      // for is deleted later, so the patient isn't welcomed twice (Codex).
      const welcomed =
        earlierVisits === 0 &&
        (await prisma.followUpDraft.count({
          where: { businessId, clientId: appointment.clientId, kind: "NEW_PATIENT_WELCOME", status: "SENT" },
        })) > 0;
      kind = earlierVisits === 0 && !welcomed && !args.notNewPatient ? "NEW_PATIENT_WELCOME" : "BOOKING_CONFIRMATION";
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
      // out, so the patient only ever hears where the visit stands now. Only
      // notices about an older version: an older edit finishing after a newer
      // one must not withdraw the newer notice (Codex).
      await prisma.followUpDraft.updateMany({
        where: {
          businessId,
          appointmentId: appointment.id,
          kind: "VISIT_CHANGED",
          status: "PENDING",
          appointmentGeneration: { lt: appointment.reminderGeneration },
        },
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
        appointmentGeneration: appointment.reminderGeneration,
        body,
        autoSend,
        dedupeKey:
          kind === "VISIT_CHANGED"
            ? `${kind}:${appointment.id}:${variant}:${appointment.startAt.getTime()}:${appointment.reminderGeneration}`
            : `${kind}:${appointment.id}:${appointment.reminderGeneration}`,
      },
      select: { id: true },
    });

    // One message per version of the visit, checked after the write so two
    // requests racing each other settle it either way: whichever looks second
    // sees the other's draft (Codex). A moved or cancel notice wins over a
    // booking message for the same version; of two welcomes for one patient
    // (two first bookings saved at once), the earlier-drafted one stands and the
    // other booking gets a confirmation instead.
    const sameVersion = { businessId, appointmentId: appointment.id, appointmentGeneration: appointment.reminderGeneration };
    if (kind === "VISIT_CHANGED") {
      await prisma.followUpDraft.updateMany({
        where: { ...sameVersion, kind: { in: BOOKING_MESSAGE_KINDS }, status: "PENDING" },
        data: { status: "DISMISSED" },
      });
    } else {
      const notice = await prisma.followUpDraft.count({
        where: { ...sameVersion, kind: "VISIT_CHANGED", status: { in: ["PENDING", "SENT"] } },
      });
      const firstWelcome =
        kind === "NEW_PATIENT_WELCOME"
          ? await prisma.followUpDraft.findFirst({
              // Sent, or still waiting for a booking that stands: a welcome left
              // over from a deleted or cancelled first booking can't win (Codex).
              where: {
                businessId,
                clientId: appointment.clientId,
                kind,
                OR: [{ status: "SENT" }, { status: "PENDING", appointment: { status: { in: ["PENDING", "CONFIRMED"] } } }],
              },
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
              select: { id: true },
            })
          : null;
      const welcomedElsewhere = firstWelcome !== null && firstWelcome.id !== draft.id;
      if (notice > 0 || welcomedElsewhere) {
        await prisma.followUpDraft.updateMany({ where: { id: draft.id, status: "PENDING" }, data: { status: "DISMISSED" } });
        return notice > 0 ? null : queueVisitMessage({ ...args, notNewPatient: true });
      }
    }

    if (autoSend) dispatchSoon(businessId);
    return draft.id;
  } catch (error) {
    if (isUniqueViolation(error)) return null;
    logger.error("Drafting a visit message failed.", error, { businessId, appointmentId, event });
    return null;
  }
}

/**
 * A confirmation or welcome refused at its last check because the visit
 * changed after it was claimed: nothing went out, so the patient is still owed
 * one for the visit as it now is — unless the change already told them (a
 * moved-visit notice for this version of the visit, which queueVisitMessage's
 * own one-message-per-version check gives way to). Never throws.
 */
export async function replaceRefusedBookingMessage(args: { businessId: string; appointmentId: string }): Promise<void> {
  await queueVisitMessage({ ...args, event: "booked" });
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
      // Only a visit that has started can have been missed (Codex).
      where: { id: appointmentId, businessId, status: "NO_SHOW", startAt: { lte: now } },
      select: {
        id: true,
        clientId: true,
        startAt: true,
        reminderGeneration: true,
        client: { select: { name: true } },
        business: {
          select: {
            name: true,
            whatsappEnabled: true,
            ...AUTOMATION_SETTINGS_SELECT,
          },
        },
      },
    });
    if (!appointment) return null;

    const business = appointment.business;
    // A clinic that set up WhatsApp gets the draft even while the link is down:
    // the event happens once, and the draft waits for the link to come back
    // (automatic sends need it; a draft over 3 days late goes to review). One
    // that never set WhatsApp up gets none (Codex).
    if (!business.whatsappEnabled) return null;

    const setting = automationSettingsFromBusiness(business).MISSED_VISIT;
    if (!setting.enabled) return null;

    const delayHours = setting.timing ?? automationDefinition("MISSED_VISIT").defaultTiming ?? 1;
    // Drafted only while it is still a no-show, checked under the visit's share
    // lock: an undo ("Mark as attended") that lands meanwhile either waits for
    // this draft and then withdraws it, or has committed and nothing is drafted
    // — never a stale draft left behind that a later no-show would revive (Codex).
    return await prisma.$transaction(async (tx) => {
      await lockAppointmentShared(tx, appointment.id);
      const stillMissed = await tx.appointment.findFirst({
        where: { id: appointment.id, businessId, status: "NO_SHOW" },
        select: { id: true },
      });
      if (!stillMissed) return null;
      const draft = await tx.followUpDraft.create({
        data: {
          businessId,
          clientId: appointment.clientId,
          kind: "MISSED_VISIT",
          status: "PENDING",
          appointmentId: appointment.id,
          appointmentGeneration: appointment.reminderGeneration,
          body: renderAutomationMessage("MISSED_VISIT", setting.template, {
            client_name: appointment.client.name,
            clinic_name: business.name,
          }),
          autoSend: setting.mode === "AUTOMATIC",
          sendAfter: new Date(now.getTime() + delayHours * HOUR_MS),
          // One per mark: an undo dismisses it, and marking it again drafts anew.
          dedupeKey: `MISSED_VISIT:${appointment.id}:${now.getTime()}`,
        },
        select: { id: true },
      });
      return draft.id;
    });
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
      // Waiting, or claimed but not yet sent: its last check before the send
      // then refuses it, and it can't come back if the no-show is recorded
      // again (Codex).
      where: { ...args, kind: "MISSED_VISIT", OR: [{ status: "PENDING" }, { status: "SENT", sentAt: null }] },
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
export async function suppressOpenReminders(args: {
  businessId: string;
  appointmentId: string;
  /** The visit version the sent message described; nothing is covered for a later one. */
  appointmentGeneration: number;
  now?: Date;
}): Promise<void> {
  const { businessId, appointmentId, appointmentGeneration, now = new Date() } = args;
  const settings = await getAutomationSettings(businessId);

  await prisma.$transaction(async (tx) => {
    // Share-locked, so an edit that would move the visit on waits for this to
    // commit (and then clears these rows with its reset), or has already
    // committed and the generation no longer matches (Codex).
    await lockAppointmentShared(tx, appointmentId);
    const appointment = await tx.appointment.findFirst({
      where: {
        id: appointmentId,
        businessId,
        reminderGeneration: appointmentGeneration,
        status: { in: ["PENDING", "CONFIRMED"] },
      },
      select: { startAt: true },
    });
    if (!appointment) return;
    await coverOpenReminders(tx, appointmentId, appointment.startAt, settings, now);
  });
}

async function coverOpenReminders(
  tx: Prisma.TransactionClient,
  appointmentId: string,
  startAt: Date,
  settings: Awaited<ReturnType<typeof getAutomationSettings>>,
  now: Date
): Promise<void> {
  const appointment = { startAt };
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

  // A FAILED row is one the reminders job would retry: mark it covered too.
  // A row already SENT keeps its real send time.
  await tx.appointmentReminder.updateMany({
    where: { appointmentId, type: { in: open.map(({ type }) => type) }, status: "FAILED" },
    data: { status: "SENT", sentAt: now },
  });
  await tx.appointmentReminder.createMany({
    data: open.map(({ type }) => ({ appointmentId, type, status: "SENT" as const, sentAt: now })),
    skipDuplicates: true,
  });
}
