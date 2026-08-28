import { addHours } from "date-fns";

import { mapWithConcurrency } from "@/lib/concurrency";
import { hasTimeFor, QUERY_RESERVE_MS } from "@/lib/deadline";
import { normalizePhone, phoneLookupKey } from "@/lib/inbox";
import { logger } from "@/lib/logger";
import { sendMessage } from "@/lib/messaging";
import { prisma } from "@/lib/prisma";
import {
  NO_DUE_REMINDER,
  orderByReminderUrgency,
  rotateForFairness,
  utcDayIndex,
} from "@/lib/reminder-fairness";
import { reminderTypeForAppointment } from "@/lib/reminder-schedule";
import { formatZonedFullDate, formatZonedTime } from "@/lib/time-zone";

type ReminderSyncResult = {
  sent: number;
  failed: number;
};

/**
 * Per-tenant result. `truncated` means the tenant's own send loop stopped with
 * reminders still pending — either out of budget or because the provider
 * circuit breaker tripped — as distinct from a tenant that was never started
 * at all. Without it a run can drop reminders while reporting
 * `skippedBusinesses: 0`, because a tenant that starts just before the send
 * reserve passes the outer budget check and is counted as processed.
 *
 * Read it alongside `failed`: truncated WITH failures means the worker is
 * down; truncated WITHOUT them means the run is out of capacity.
 */
type ReminderTenantResult = ReminderSyncResult & {
  truncated: boolean;
};

export type ReminderCronResult = ReminderSyncResult & {
  processedBusinesses: number;
  skippedBusinesses: number;
  /**
   * Tenants that threw. Counted inside `skippedBusinesses` too — their
   * reminders went unsent either way — but reported separately because the
   * remedy differs: skips mean the run needs more capacity, errors mean a bug.
   */
  erroredBusinesses: number;
};

// Wall-clock budget for one reminders run. Sized under the smallest plan cap
// (Vercel Hobby: 60s) with headroom for the response to flush. Being killed
// mid-`sendMessage` is worse than skipping: the send-then-record ordering means
// a message can go out without its row being written, and the next run would
// send it again. Stopping before that window is the safer failure.
//
// Unlike the analytics cron there is no natural staleness signal to sort by
// (a reminder either goes out or doesn't; nothing records "last reached"), so
// tenants are ordered by their most imminent due reminder instead, with the
// daily rotation in `lib/reminder-fairness.ts` retained as a stable tie-break.
// `skippedBusinesses` stays exposed so a truncated run is still visible in the
// cron response.
export const REMINDER_RUN_BUDGET_MS = 50_000;

// Headroom reserved before starting another send: the messaging adapter's own
// worker timeout (25s) plus room to persist the SENT marker afterwards. Kept
// as a local constant rather than imported from the adapter — feature code
// goes through the `sendMessage` seam and must not reach into a provider.
const SEND_RESERVE_MS = 27_000;

// Two per-tenant reads (settings, then the appointment window) before any
// send is attempted.
const TENANT_QUERY_RESERVE_MS = 2 * QUERY_RESERVE_MS;

// Upper bound on appointments handled for one tenant in one run. The fan-out is
// one external send per appointment, so without a cap a single busy clinic can
// exceed the function cap on its own regardless of when it started. Ordered
// `startAt: "asc"`, so the cap drops the furthest-out reminders, which are
// still inside the window on the next hourly run.
const MAX_APPOINTMENTS_PER_TENANT = 200;

export async function syncAppointmentRemindersForBusiness(
  businessId: string,
  /**
   * Optional wall-clock deadline (epoch ms) for this tenant's sends. The cron
   * passes the end of its run budget: the appointment fan-out is a sequential
   * external send per appointment, so one busy clinic could otherwise run past
   * the platform's function cap on its own, no matter when it started. Capped
   * by MAX_APPOINTMENTS_PER_TENANT as well; both bounds are needed, since a cap
   * alone doesn't bound slow sends and a deadline alone doesn't bound volume. Truncating is safe here because the query is ordered
   * `startAt: "asc"` — the soonest reminders go first, and anything dropped is
   * still in the window on the next run.
   */
  deadlineAt?: number
): Promise<ReminderTenantResult> {
  // Gate BEFORE the reads, not just before the sends. These two queries run
  // unconditionally today, so on a slow database they can consume the caller's
  // remaining budget before the send-reserve check is ever reached.
  if (!hasTimeFor(deadlineAt, TENANT_QUERY_RESERVE_MS)) {
    return { sent: 0, failed: 0, truncated: true };
  }

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
    return { sent: 0, failed: 0, truncated: false };
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

  // Re-check between the reads: the first one may have taken the remaining time.
  if (!hasTimeFor(deadlineAt, SEND_RESERVE_MS)) {
    return { sent: 0, failed: 0, truncated: true };
  }

  const appointments = await prisma.appointment.findMany({
    // One EXTRA row purely to detect the cap. A bare `take:` silently drops the
    // remainder while still reporting a completed tenant — the same defect the
    // stale sweep had with its own cap. The predicate here is a SUPERSET of
    // sendable work, so the omitted rows may include the only genuinely due
    // reminder, which makes silent truncation worse than it looks.
    take: MAX_APPOINTMENTS_PER_TENANT + 1,
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
  // Cap reached: process what we have and tell the caller more remain, so the
  // run can't report skippedBusinesses: 0 while leaving reminders unsent.
  let truncated = appointments.length > MAX_APPOINTMENTS_PER_TENANT;
  if (truncated) {
    appointments.length = MAX_APPOINTMENTS_PER_TENANT;
  }

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

    // Out of time: stop before starting another external send rather than
    // being killed partway through one (send-then-record means a kill can
    // deliver a message whose row never gets written, and the next run would
    // send it again).
    //
    // Reserving the WORST CASE matters: a bare `now >= deadlineAt` check
    // passes at deadline-1ms and then blocks for the adapter's full send
    // timeout, recreating exactly the kill-after-delivery window this guard
    // exists to prevent.
    //
    // Placed AFTER eligibility on purpose. `reminderTypeForAppointment` is
    // pure and cheap, and checking first would flag the tenant as truncated
    // merely because the query returned rows — the window query is a superset
    // that can include appointments with nothing currently due. That would
    // report dropped work where none existed and make `skippedBusinesses`
    // useless as a signal.
    if (!hasTimeFor(deadlineAt, SEND_RESERVE_MS)) {
      truncated = true;
      break;
    }

    const clientPhone = normalizePhone(appointment.client.phone);
    // Canonical dedup key (digits only) — the conversation is keyed on this so a
    // reminder and the patient's later inbound reply resolve to the SAME row.
    const clientPhoneKey = phoneLookupKey(appointment.client.phone);

    if (!clientPhone || !clientPhoneKey) {
      failed += 1;
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
      // Only a worker/connection failure signals "the worker is down"; a bad
      // recipient or empty body is per-message and shouldn't trip the breaker.
      consecutiveProviderErrors =
        result.reason === "provider_error" ? consecutiveProviderErrors + 1 : 0;
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
        // Also a truncation: the loop stops with reminders still pending, the
        // same user-visible outcome as running out of budget. `failed` is what
        // distinguishes the two in the cron response — truncated with failures
        // means the worker is down, truncated with none means the run needs
        // more capacity.
        truncated = true;
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
      consecutiveProviderErrors = 0;
    } catch (error) {
      // Couldn't even record the SENT marker — count as failed. It may re-send
      // on the next run: the minimal, irreducible at-least-once window, far
      // rarer than a multi-write transaction failing.
      failed += 1;
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

  return { sent, failed, truncated };
}

// A few clinics at a time — bounds concurrent outbound sends across tenants.
const REMINDER_BUSINESS_CONCURRENCY = 3;

/**
 * Live progress, mutated as tenants settle. The route's hard backstop reads it
 * so a timeout reports what the run actually reached — reporting zeros would
 * suppress the caller's capacity warning, which only fires on
 * `skippedBusinesses > 0`.
 */
export type ReminderProgress = {
  total: number;
  finished: number;
  skipped: number;
  errored: number;
};

export async function syncAppointmentRemindersJob(
  progress: ReminderProgress = { total: 0, finished: 0, skipped: 0, errored: 0 }
): Promise<ReminderCronResult> {
  // Absolute deadline captured at ENTRY, before the tenant lookup and the
  // urgency aggregation below. Starting the clock after them leaves those
  // queries uncounted, so on a slow database a send could still begin with the
  // full local budget and be killed after delivery but before its SENT marker
  // is written — the duplicate-send window this guard exists to close.
  const runDeadlineAt = Date.now() + REMINDER_RUN_BUDGET_MS;

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

  // Publish the total the instant it is known, BEFORE the urgency aggregation.
  // Assigning it after that second query means a stall there leaves the hard
  // backstop reporting total 0 — so `total - finished` is 0, the run looks
  // clean, and the caller's capacity warning never fires.
  progress.total = businesses.length;

  // Order by MOST IMMINENT due reminder, not just fairness.
  //
  // Rotation alone is insufficient: a reminder window is at most 24h and this
  // cron runs once daily, so a tenant skipped on the single run before an
  // appointment can't recover when it rotates forward days later — that
  // appointment is already past. Sending the soonest-due reminders first means
  // a truncated run drops the furthest-out ones, which are still in the window
  // on the next run.
  //
  // Rotation is retained underneath as the tie-break: the sort is stable, so
  // tenants with no due reminders (or identical urgency) still take turns
  // instead of being ordered the same way forever.
  const now = new Date();
  // Between the job's own two setup queries: if the tenant lookup was slow
  // there may be nothing left, and the aggregation would spend what remains.
  if (!hasTimeFor(runDeadlineAt, TENANT_QUERY_RESERVE_MS)) {
    progress.skipped = businesses.length;
    return {
      processedBusinesses: businesses.length,
      skippedBusinesses: businesses.length,
      erroredBusinesses: 0,
      sent: 0,
      failed: 0,
    };
  }

  const soonestDue = await prisma.appointment.groupBy({
    by: ["businessId"],
    where: {
      businessId: { in: businesses.map((business) => business.id) },
      status: { not: "CANCELLED" },
      // Per-business reminder hours are clamped to <= 24, so this is a safe
      // superset of every tenant's actual window.
      startAt: { gt: now, lte: addHours(now, 24) },
      // NOTE: no attempt is made to exclude appointments whose reminders have
      // already been sent. An earlier version filtered on a SENT `TWO_HOUR`
      // row, assuming it was the last reminder due — it isn't.
      // `firstReminderHours` and `secondReminderHours` are each independently
      // clamped to 1..24 and the enum is POSITIONAL, so a clinic with
      // first=2h / second=24h sends `TWO_HOUR` first and still owes
      // `TWENTY_FOUR_HOUR`. That filter could therefore hide a tenant with
      // genuinely pending work — under-inclusion, the dangerous direction.
      //
      // Ordering here is deliberately an approximation: over-inclusive, so a
      // finished tenant may sort as urgent (wasteful, never harmful). Making
      // it exact means re-deriving each tenant's window from its own settings
      // in SQL, which is complexity spent rationing capacity rather than
      // adding it — see the scheduler note in PROJECT_STATUS.
    },
    _min: { startAt: true },
  });

  const soonestDueAt = new Map(
    soonestDue.map((row) => [
      row.businessId,
      row._min.startAt?.getTime() ?? NO_DUE_REMINDER,
    ])
  );

  const orderedBusinesses = orderByReminderUrgency(
    rotateForFairness(businesses, utcDayIndex()),
    soonestDueAt
  );

  let skippedBusinesses = 0;
  let erroredBusinesses = 0;

  const results = await mapWithConcurrency(
    orderedBusinesses,
    REMINDER_BUSINESS_CONCURRENCY,
    async (business) => {
      // Out of budget: skip rather than start another tenant's sends and risk
      // being killed partway through one.
      // Admission requires room for the tenant's OWN reads plus a send, not
      // merely an unexpired deadline — otherwise a worker freeing up at 49s
      // starts a tenant that then runs two queries past the cap.
      if (!hasTimeFor(runDeadlineAt, TENANT_QUERY_RESERVE_MS + SEND_RESERVE_MS)) {
        skippedBusinesses += 1;
        progress.finished += 1;
        progress.skipped += 1;
        return { sent: 0, failed: 0, truncated: false };
      }

      try {
        const result = await syncAppointmentRemindersForBusiness(
          business.id,
          runDeadlineAt
        );
        // A tenant whose own loop stopped on the deadline dropped reminders
        // just as surely as one never started — count it, or the truncation
        // signal reads 0 while work was left undone.
        if (result.truncated) {
          skippedBusinesses += 1;
          progress.skipped += 1;
        }
        progress.finished += 1;
        return result;
      } catch (error) {
        // Isolate per-tenant failures so one clinic can't abort the whole run —
        // but COUNT it. A thrown tenant sent nothing, so reporting it as merely
        // finished yields failed: 0 and skippedBusinesses: 0, and the caller
        // reads a clean run while that clinic's reminders were dropped.
        erroredBusinesses += 1;
        skippedBusinesses += 1;
        progress.errored += 1;
        progress.skipped += 1;
        progress.finished += 1;
        logger.error("Reminder sync failed for business.", error, {
          businessId: business.id,
        });
        return { sent: 0, failed: 0, truncated: false };
      }
    }
  );

  const sent = results.reduce((total, result) => total + result.sent, 0);
  const failed = results.reduce((total, result) => total + result.failed, 0);

  return {
    processedBusinesses: businesses.length,
    skippedBusinesses,
    erroredBusinesses,
    sent,
    failed,
  };
}
