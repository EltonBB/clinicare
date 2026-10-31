import type { Locale } from "@/i18n/config";
import { fmt } from "@/i18n/format";
import { messages, type Messages } from "@/i18n/messages";
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
export function billingBanner(
  access: WorkspaceAccess,
  timeZone?: string,
  locale: Locale = "en",
  copy: Messages["shell"]["billingBanner"] = messages[locale].shell.billingBanner,
): BillingBanner | null {
  const date = (value: Date) => formatZonedFullDate(value, timeZone, locale);
  if (access.kind === "locked") {
    const kept = access.keptUntil ? ` ${fmt(copy.keptUntil, { date: date(access.keptUntil) })}` : "";
    return {
      tone: "locked",
      message: `${copy.locked}${kept}`,
      action: copy.renew,
    };
  }
  if (access.kind !== "full" || !access.notice) return null;

  switch (access.notice.kind) {
    case "past_due":
      return {
        tone: "warning",
        message: copy.pastDue,
        action: copy.updateCard,
      };
    case "ending":
      return {
        tone: "warning",
        message: fmt(copy.ending, { date: date(access.notice.endsAt) }),
        action: copy.manage,
      };
    case "trial":
      return null;
  }
}
