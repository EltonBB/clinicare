import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MAX_MESSAGE_BODY_LENGTH } from "@/lib/messaging/limits";

import { serverText } from "./messages/sq/server-text";
import { translateServerText } from "./server-text";

// Action files whose messages are translated; each phase adds its own.
const COVERED = [
  "src/app/(auth)/actions.ts",
  "src/lib/business.ts",
  "src/app/onboarding/actions.ts",
  "src/lib/media-storage-client.ts",
  "src/app/(workspace)/calendar/actions.ts",
  "src/app/(workspace)/calendar/waitlist-actions.ts",
  "src/lib/waitlist.ts",
  "src/lib/appointments-shared.ts",
  "src/lib/appointments.ts",
  "src/app/(workspace)/clients/actions.ts",
  "src/app/(workspace)/staff/actions.ts",
  "src/lib/mobile/admin-inbox.ts",
  "src/app/(workspace)/inbox/actions.ts",
  "src/lib/inbox-server.ts",
  "src/lib/messaging/limits.ts",
  "src/app/(workspace)/automations/actions.ts",
  "src/app/(workspace)/automations/review/actions.ts",
  "src/lib/follow-ups-data.ts",
  "src/lib/follow-up-dispatch.ts",
  "src/app/(workspace)/settings/actions.ts",
  "src/app/(workspace)/settings/billing-actions.ts",
];

// Literals in covered files that no screen shows: log lines, and the staff
// app's push text (translated with the staff app).
const NOT_SHOWN = new Set([
  "Couldn't remove a waiting-list entry.",
  "Failed to notify staff of an appointment change.",
  "notifyStaffOfAppointmentChange called with a staffMemberId outside businessId.",
  "Your clinic booked a new appointment for you.",
  "Your clinic changed one of your appointments.",
  "Failed to generate mobile access code.",
  "Failed to revoke mobile access.",
  "Failed to send staff message.",
  "Failed to mark staff thread read.",
  "Failed to mark staff check-ins seen.",
  "Failed to notify staff after saving an admin message.",
  "WhatsApp outbound send held back by the clinic's sending ceiling.",
  "WhatsApp outbound send failed.",
  "Inbox unread-conversation merge returned an unusually large result.",
  "Failed to normalize inbox conversations for business.",
  "Saving an automation failed.",
  "Failed to refresh WhatsApp connection after settings load.",
  "discardUnsavedLogoAction received a candidate outside the logos/ folder — dropped without queueing.",
  "Couldn't load the billing details.",
  "Couldn't save the billing details.",
  "Couldn't change the subscription's plan.",
  "Couldn't load the billing history.",
  "Couldn't open an invoice.",
  "Couldn't schedule the plan's end.",
  "Couldn't resume the plan.",
  "Couldn't start a card update.",
  "Couldn't move the subscription to Pro.",
  "Switching an automation failed.",
  "Couldn't book a slot offer.",
  "Couldn't skip a follow-up draft.",
  "Couldn't record a declined slot offer.",
  "Withdrawing stale high-risk reminders failed.",
  "Sent a reminder from review but couldn't record it as sent.",
  "Couldn't record due reminders as covered by a sent visit message.",
  "A follow-up send failed after the draft was marked sent.",
  "A follow-up's delivery is uncertain and it couldn't be recorded as sent.",
  "Sent a follow-up but couldn't record it as delivered.",
  "Couldn't stop an unsendable draft from sending on its own.",
  "An automatic follow-up send failed.",
]);

// Literal sentences an action shows a person: `error:`, `success:`, `message:`
// (or assigned to such a variable), the constants they come from, `return`ed
// sentences, the branches of a multi-line `? :`, sentences alone on a line (a
// list of messages), and Zod messages like `.email("…")` or `.min(8, "…")`.
const LITERAL = /(?:\b(?:error|success|message)\s*[:=]\s*|_(?:ERROR|MESSAGE)\s*=\s*|^\s*(?:[?:]|return)?\s*|\.\w+\((?:[^()"]*,\s*)?)"((?:[^"\\]|\\.)*[a-z][^"]*[.?!])"/gm;

function literals(file: string) {
  const source = readFileSync(join(process.cwd(), file), "utf8");
  return [...source.matchAll(LITERAL)].map((match) => match[1].replace(/\\(.)/g, "$1"));
}

describe("server messages in Albanian", () => {
  it.each(COVERED)("%s: every literal message has a translation", (file) => {
    const missing = literals(file).filter((text) => !NOT_SHOWN.has(text) && translateServerText(text, "sq") === text);
    expect(missing).toEqual([]);
  });

  it.each(Object.entries(serverText))("%s keeps its placeholders", (source, target) => {
    const names = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    expect(names(target)).toEqual(names(source));
    expect(target).not.toBe(source);
  });

  // Built at runtime, so the literal scan above can't see them.
  it("translates the messages built from numbers", () => {
    const tooLong = `Messages can be up to ${MAX_MESSAGE_BODY_LENGTH.toLocaleString("en-US")} characters.`;
    expect(translateServerText(tooLong, "sq")).not.toBe(tooLong);
    expect(translateServerText("You've sent a lot of messages in a short time. Wait about 3 minutes, then send again.", "sq")).toContain(
      "rreth 3 minuta",
    );
  });

  it("fills placeholders and leaves unknown text and English alone", () => {
    expect(translateServerText("A password reset link was sent to maya@clinic.com.", "sq")).toBe(
      "U dërgua një lidhje për rivendosjen e fjalëkalimit te maya@clinic.com.",
    );
    expect(translateServerText("Something new.", "sq")).toBe("Something new.");
    expect(translateServerText("Enter your password.", "en")).toBe("Enter your password.");
  });
});
