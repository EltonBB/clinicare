import { addHours } from "date-fns";

import { mapWithConcurrency, withDeadline } from "@/lib/concurrency";
import { normalizePhone, phoneLookupKey } from "@/lib/inbox";
import { logger } from "@/lib/logger";
import { sendMessage } from "@/lib/messaging";
import { prisma } from "@/lib/prisma";
import { getReminderCursor, setReminderCursor } from "@/lib/reminder-cursor";
import { lastAttemptedId, rotateForFairness } from "@/lib/reminder-fairness";
import { reminderTypeForAppointment } from "@/lib/reminder-schedule";
import { PER_BUSINESS_TIMEOUT_MS, REMINDER_RUN_BUDGET_MS } from "@/lib/reminder-timing";
import { formatZonedFullDate, formatZonedTime } from "@/lib/time-zone";

type ReminderSyncResult = {
  sent: number;
  failed: number;
};

export type ReminderCronResult = ReminderSyncResult & {
  processedBusinesses: number;
  /**
   * Businesses not attempted because the run was out of time. Retried next
   * hour — nothing here was lost, only deferred. Distinct from `failed`
   * (a send that was attempted and didn't go through).
   */
  skippedBusinesses: number;
  /**
   * Businesses given up on after PER_BUSINESS_TIMEOUT_MS. Distinct from both
   * `skipped` (never started) and `failed` (started, produced a result): an
   * abandoned business's `syncAppointmentRemindersForBusiness` call is still
   * running in the background with no way to cancel it (Prisma has no abort
   * handle) — it may still send or write after this function returns. The
   * caller (the cron route) must treat this the same as its own hard-deadline
   * timeout for lock-release purposes: releasing the lock while background
   * work might still be sending would let an overlapping invocation read the
   * same appointment as not-yet-reminded and send it twice.
   */
  abandonedBusinesses: number;
};

export async function syncAppointmentRemindersForBusiness(
  businessId: string,
  progress: Pick<ReminderRunProgress, "sent" | "failed">
): Promise<void> {
  const now = new Date();
  const business = await prisma.business.findUnique({
    where: {
      id: businessId,
    },
    select: {
      id: true,
      name: true,
      whatsappEnabled: true,
      reminderSettings: {
        select: {
          send24HourReminder: true,
          send2HourReminder: true,
          firstReminderHours: true,
          secondReminderHours: true,
          template: true,
        },
      },
      whatsappConnection: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  });

  // ERRORED is a soft, recoverable state: re-attempt so a transient outage
  // self-heals back to CONNECTED on the next successful send (the success path
  // below sets CONNECTED), rather than excluding the clinic from reminders until
  // someone re-pairs.
  const connectionStatus = business?.whatsappConnection?.status;
  if (
    !business ||
    !business.whatsappEnabled ||
    (connectionStatus !== "CONNECTED" && connectionStatus !== "ERRORED")
  ) {
    return;
  }

  const reminderSettings = business.reminderSettings;
  // The seam renders the body (and falls back to a default min-necessary
  // template); pass the clinic's custom template through when set.
  const template = reminderSettings?.template?.trim() || undefined;

  const firstReminderHours = Math.min(
    Math.max(reminderSettings?.firstReminderHours ?? 24, 1),
    24
  );
  const secondReminderHours = Math.min(
    Math.max(reminderSettings?.secondReminderHours ?? 2, 1),
    24
  );
  const maxReminderHours = Math.max(firstReminderHours, secondReminderHours);

  const appointments = await prisma.appointment.findMany({
    where: {
      businessId,
      status: {
        not: "CANCELLED",
      },
      startAt: {
        gt: now,
        lte: addHours(now, maxReminderHours),
      },
    },
    include: {
      client: {
        select: {
          id: true,
          name: true,
          phone: true,
        },
      },
      staffMember: {
        select: {
          name: true,
        },
      },
      reminders: {
        select: {
          type: true,
          status: true,
        },
      },
    },
    orderBy: {
      startAt: "asc",
    },
  });

  let sent = 0;
  let failed = 0;
  // Circuit breaker: each failed send burns the adapter's ~25s worker timeout.
  // If the worker is down, stop after a couple of consecutive provider failures
  // so one unreachable worker can't exhaust the cron budget and starve other
  // tenants — the unsent reminders simply retry on the next run.
  let consecutiveProviderErrors = 0;
  const MAX_CONSECUTIVE_PROVIDER_ERRORS = 2;

  for (const appointment of appointments) {
    const reminderType = reminderTypeForAppointment({
      startsAt: appointment.startAt,
      now,
      send24HourReminder: reminderSettings?.send24HourReminder ?? true,
      send2HourReminder: reminderSettings?.send2HourReminder ?? true,
      firstReminderHours,
      secondReminderHours,
      // Only delivered reminders suppress a re-send; a FAILED row retries.
      sentTypes: new Set(
        appointment.reminders
          .filter((reminder) => reminder.status === "SENT")
          .map((reminder) => reminder.type)
      ),
    });

    if (!reminderType) {
      continue;
    }

    const clientPhone = normalizePhone(appointment.client.phone);
    // Canonical dedup key (digits only) — the conversation is keyed on this so a
    // reminder and the patient's later inbound reply resolve to the SAME row.
    const clientPhoneKey = phoneLookupKey(appointment.client.phone);

    if (!clientPhone || !clientPhoneKey) {
      failed += 1;
      progress.failed += 1;
      continue;
    }

    // Outbound reminders flow through the messaging seam, which renders a HIPAA
    // minimum-necessary body (name + appointment time only — never the
    // service/treatment) and routes to the active WhatsApp provider.
    const result = await sendMessage({
      channel: "WHATSAPP",
      businessId,
      to: clientPhone,
      message: {
        kind: "appointment_reminder",
        recipientName: appointment.client.name,
        appointmentDate: formatZonedFullDate(appointment.startAt),
        appointmentTime: formatZonedTime(appointment.startAt),
        staffName: appointment.staffMember?.name ?? business.name,
        template,
      },
    });

    if (!result.ok) {
      failed += 1;
      progress.failed += 1;
      // Only a worker/connection failure signals "the worker is down"; a bad
      // recipient or empty body is per-message and shouldn't trip the breaker.
      consecutiveProviderErrors =
        result.reason === "provider_error" ? consecutiveProviderErrors + 1 : 0;

      // `provider_error` means the pipeline itself is unhealthy (worth
      // Sentry); the other reasons are a problem with one client's data (bad
      // phone, an overlong custom template) — visible in logs, no page.
      // result.error is the seam's customer-safe, provider-neutral copy (see
      // SendMessageResult) — safe to log verbatim, never PHI or a provider name.
      const failureContext = {
        businessId,
        appointmentId: appointment.id,
        reminderType,
        reason: result.reason,
        detail: result.error,
      };
      if (result.reason === "provider_error") {
        logger.error("Reminder send failed — provider error.", undefined, failureContext);
      } else {
        logger.warn("Reminder send failed.", failureContext);
      }

      // Persist the failure so it's visible and retried on the next run.
      await prisma.appointmentReminder
        .upsert({
          where: {
            appointmentId_type: {
              appointmentId: appointment.id,
              type: reminderType,
            },
          },
          create: {
            appointmentId: appointment.id,
            type: reminderType,
            status: "FAILED",
          },
          update: {
            status: "FAILED",
          },
        })
        .catch((error) => {
          logger.error("Failed to record reminder failure.", error, {
            businessId,
            appointmentId: appointment.id,
            reminderType,
          });
        });
      if (consecutiveProviderErrors >= MAX_CONSECUTIVE_PROVIDER_ERRORS) {
        logger.warn(
          "Stopping reminder run early — WhatsApp worker appears unavailable.",
          { businessId, attempted: sent + failed }
        );
        break;
      }
      continue;
    }

    // The send succeeded (the patient received the WhatsApp). Persist the SENT
    // marker FIRST and on its own: it is the ONLY dedup key for reminders, so it
    // must not be coupled to the secondary inbox/connection writes below. If it
    // were part of one transaction, a failure in those secondary writes would
    // roll back the SENT row too, leaving a delivered reminder un-recorded — and
    // the next cron run would re-send it to the patient.
    try {
      await prisma.appointmentReminder.upsert({
        where: {
          appointmentId_type: {
            appointmentId: appointment.id,
            type: reminderType,
          },
        },
        create: {
          appointmentId: appointment.id,
          type: reminderType,
          status: "SENT",
        },
        update: {
          status: "SENT",
          sentAt: new Date(),
        },
      });
      sent += 1;
      progress.sent += 1;
      consecutiveProviderErrors = 0;
    } catch (error) {
      // Couldn't even record the SENT marker — count as failed. It may re-send
      // on the next run: the minimal, irreducible at-least-once window, far
      // rarer than a multi-write transaction failing.
      failed += 1;
      progress.failed += 1;
      logger.error("Failed to record sent reminder.", error, {
        businessId,
        appointmentId: appointment.id,
        reminderType,
      });
      continue;
    }

    // Secondary, best-effort: mirror the reminder into the patient's inbox
    // thread and refresh the connection heartbeat. A failure here must NOT cause
    // a re-send — the SENT marker above already dedups — so it is swallowed.
    try {
      await prisma.$transaction(async (tx) => {
        const clientConversation = await tx.conversation.upsert({
          where: {
            businessId_phoneKey: {
              businessId,
              phoneKey: clientPhoneKey,
            },
          },
          update: {
            // Never touch unreadCount here — this is an outbound reminder, not
            // a read receipt; resetting it would silently clear real unread
            // patient replies (see messaging/inbound.ts for the read-vs-write
            // split this mirrors).
            contactName: appointment.client.name,
          },
          create: {
            businessId,
            phoneNumber: clientPhone,
            phoneKey: clientPhoneKey,
            contactName: appointment.client.name,
            unreadCount: 0,
          },
          select: {
            id: true,
          },
        });

        await tx.message.create({
          data: {
            conversationId: clientConversation.id,
            clientId: appointment.client.id,
            direction: "OUTBOUND",
            body: result.body,
            providerMessageSid: result.providerMessageId,
            deliveryStatus: result.status,
            deliveryUpdatedAt: new Date(),
          },
        });

        await tx.whatsAppConnection.update({
          where: {
            businessId,
          },
          data: {
            status: "CONNECTED",
            lastSyncedAt: new Date(),
          },
        });
      });
    } catch (error) {
      logger.error("Recorded the reminder but couldn't mirror it to the inbox.", error, {
        businessId,
        appointmentId: appointment.id,
        reminderType,
      });
    }
  }
}

// A few clinics at a time — bounds concurrent outbound sends across tenants.
const REMINDER_BUSINESS_CONCURRENCY = 3;

// PER_BUSINESS_TIMEOUT_MS and REMINDER_RUN_BUDGET_MS (and the
// HARD_RESPONSE_DEADLINE_MS the latter is derived from) live in
// reminder-timing.ts — a prisma-free module so their relationship can be
// unit-tested — and the cron route imports HARD_RESPONSE_DEADLINE_MS from
// there directly rather than through here.

/**
 * Live counters, mutated as each business finishes — not just the final
 * totals computed after everything resolves. With concurrency > 1, a caller
 * racing this job against a hard deadline (the cron route) can be abandoned
 * mid-run: if it only had access to the return value, a timeout would report
 * zeros even though other workers may have already sent real reminders. This
 * object is what lets the caller report what actually happened instead, using
 * the SAME field meanings the normal return uses — `total` stays "eligible
 * businesses found" whether the run finished or was abandoned, so a reader
 * never has to know which path produced a given response to interpret it.
 */
export type ReminderRunProgress = {
  /** Eligible businesses found. 0 until the initial query resolves. */
  total: number;
  skipped: number;
  sent: number;
  failed: number;
  abandoned: number;
};

export function createReminderRunProgress(): ReminderRunProgress {
  return { total: 0, skipped: 0, sent: 0, failed: 0, abandoned: 0 };
}

export async function syncAppointmentRemindersJob(
  runDeadlineAt: number = Date.now() + REMINDER_RUN_BUDGET_MS,
  progress: ReminderRunProgress = createReminderRunProgress()
): Promise<ReminderCronResult> {
  const businesses = await prisma.business.findMany({
    where: {
      whatsappEnabled: true,
      whatsappConnection: {
        is: {
          // ERRORED included so a transiently-failed connection still gets
          // reminder attempts and self-heals to CONNECTED on the next success.
          status: { in: ["CONNECTED", "ERRORED"] },
        },
      },
    },
    select: {
      id: true,
    },
    // Stable base order; the rotation below is only meaningful if the
    // underlying order doesn't shuffle between runs.
    orderBy: { id: "asc" },
  });

  progress.total = businesses.length;

  // Resume from wherever the LAST run left off, not from a clock-derived
  // guess: under sustained low throughput (few businesses fit per run), a
  // fixed per-hour advance barely moves — see reminder-cursor.ts. Anchored to
  // a business id, not an ordinal position, so a membership change between
  // runs (WhatsApp toggled, a connection flipping status) can't silently
  // skip whoever was actually next — see reminder-fairness.ts.
  const startAfterId = await getReminderCursor();
  const orderedBusinesses = rotateForFairness(businesses, startAfterId);

  await mapWithConcurrency(orderedBusinesses, REMINDER_BUSINESS_CONCURRENCY, async (business) => {
    if (Date.now() >= runDeadlineAt) {
      progress.skipped += 1;
      return;
    }

    // syncAppointmentRemindersForBusiness mutates `progress.sent`/`.failed`
    // live, per appointment — not via a return value collected at the end —
    // specifically so a business that sends 2 of its 3 due reminders before
    // hanging on the 3rd still has those 2 counted. A return-value-only
    // design would discard them: the timeout branch below has no result to
    // report, only whatever `progress` already reflects at the moment it
    // gives up.
    await withDeadline(
      syncAppointmentRemindersForBusiness(business.id, progress).catch((error) => {
        // Isolate per-tenant failures so one clinic can't abort the whole run.
        logger.error("Reminder sync failed for business.", error, {
          businessId: business.id,
        });
      }),
      PER_BUSINESS_TIMEOUT_MS,
      () => {
        progress.abandoned += 1;
        logger.error(
          "Reminder sync exceeded its per-business timeout — likely a hung database call. Moving on so this run (and its cursor) keeps making progress, but the abandoned call may still be running.",
          undefined,
          { businessId: business.id, timeoutMs: PER_BUSINESS_TIMEOUT_MS }
        );
      }
    );
  });

  // Advance to the id of the LAST business given a turn this run (attempted,
  // whether it succeeded, failed, or timed out — all took a turn; only
  // `skipped` never got one) — not by a fixed count over a mutable list. That
  // is what makes the next run start at the actual skipped suffix instead of
  // re-covering ground already attempted or silently skipping ahead when the
  // eligible set changed. lastAttemptedId returns null when nothing was
  // attempted, in which case the persisted cursor is deliberately left
  // untouched — the next run resumes from the same place.
  const attempted = progress.total - progress.skipped;
  const nextCursor = lastAttemptedId(orderedBusinesses, attempted);
  if (nextCursor !== null) {
    await setReminderCursor(nextCursor);
  }

  if (progress.skipped > 0) {
    logger.warn("Reminder run out of time; some clinics deferred to next hour.", {
      skippedBusinesses: progress.skipped,
      processedBusinesses: progress.total,
    });
  }

  return {
    processedBusinesses: progress.total,
    sent: progress.sent,
    failed: progress.failed,
    skippedBusinesses: progress.skipped,
    abandonedBusinesses: progress.abandoned,
  };
}
