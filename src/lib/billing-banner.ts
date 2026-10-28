import type { WorkspaceAccess } from "@/lib/billing-access";
import { formatZonedFullDate } from "@/lib/time-zone";

/** The one billing line shown above every workspace page, or nothing. */
export type BillingBanner = {
  tone: "locked" | "warning";
  message: string;
  action: string;
};

/**
 * Copy for the workspace's billing banner. Quiet by design: a running trial
 * shows nothing (Paddle emails the reminder before it converts); only a lock,
 * a failed payment or a scheduled end gets a line.
 */
export function billingBanner(access: WorkspaceAccess, timeZone?: string): BillingBanner | null {
  if (access.kind === "locked") {
    const kept = access.keptUntil
      ? ` Your records are kept until ${formatZonedFullDate(access.keptUntil, timeZone)}.`
      : "";
    return {
      tone: "locked",
      message: `This workspace is read-only because its plan has ended.${kept}`,
      action: "Renew plan",
    };
  }
  if (access.kind !== "full" || !access.notice) return null;

  switch (access.notice.kind) {
    case "past_due":
      return {
        tone: "warning",
        message: "Your last payment didn't go through. Update your card to keep using Vela.",
        action: "Update card",
      };
    case "ending":
      return {
        tone: "warning",
        message: `Your plan ends on ${formatZonedFullDate(access.notice.endsAt, timeZone)}. After that the workspace becomes read-only.`,
        action: "Manage plan",
      };
    case "trial":
      return null;
  }
}
