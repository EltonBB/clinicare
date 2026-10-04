import type { OutboundMessage } from "./types";

/**
 * Default reminder copy — minimum-necessary by construction (name + time only).
 * Mirrors the fallback in `lib/reminders.ts` so the eventual caller migration
 * is a no-op in output.
 */
export const DEFAULT_REMINDER_TEMPLATE =
  "Hi {client_name}, this is a reminder for your appointment at {time} on {date}. Reply 1 to confirm or 2 to cancel.";

/**
 * The default before confirm/cancel-by-reply existed. Onboarding saved the
 * default into every new workspace's settings, so a workspace created while it
 * was current still holds this exact text - and its patients would never be
 * told they can reply 1 or 2 (Codex #130). The stored rows were updated once,
 * but the code that writes this text keeps running until this change deploys,
 * so it is also mapped here, on every read. A clinic that wrote its own wording
 * is left alone.
 */
const LEGACY_DEFAULT_REMINDER_TEMPLATE =
  "Hi {client_name}, this is a reminder for your appointment at {time} on {date}. Reply here if you need to reschedule.";

/** The reminder text in force for a stored template: the default when it is empty or the old default. */
export function effectiveReminderTemplate(stored: string | null | undefined): string {
  const template = stored?.trim();
  return !template || template === LEGACY_DEFAULT_REMINDER_TEMPLATE ? DEFAULT_REMINDER_TEMPLATE : template;
}

/**
 * Renders an appointment reminder body.
 *
 * HIPAA minimum-necessary: only the patient's name, appointment date/time, and
 * optional staff name are ever interpolated. Any other token — `{service}`,
 * `{diagnosis}`, anything — renders EMPTY by design, so clinical detail can
 * never ride out on a reminder even if a custom template references it. This
 * matches `renderReminderTemplate` in `lib/reminders.ts` exactly.
 */
export function renderReminder(
  message: Extract<OutboundMessage, { kind: "appointment_reminder" }>
): string {
  const template = effectiveReminderTemplate(message.template);
  const values: Record<string, string> = {
    client_name: message.recipientName,
    date: message.appointmentDate,
    time: message.appointmentTime,
    staff_name: message.staffName ?? "",
  };
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
}
