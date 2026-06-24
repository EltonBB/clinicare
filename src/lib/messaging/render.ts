import type { OutboundMessage } from "./types";

/**
 * Default reminder copy — minimum-necessary by construction (name + time only).
 * Mirrors the fallback in `lib/reminders.ts` so the eventual caller migration
 * is a no-op in output.
 */
export const DEFAULT_REMINDER_TEMPLATE =
  "Hi {client_name}, this is a reminder for your appointment at {time} on {date}. Reply here if you need to reschedule.";

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
  const template = message.template?.trim() || DEFAULT_REMINDER_TEMPLATE;
  const values: Record<string, string> = {
    client_name: message.recipientName,
    date: message.appointmentDate,
    time: message.appointmentTime,
    staff_name: message.staffName ?? "",
  };
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
}
