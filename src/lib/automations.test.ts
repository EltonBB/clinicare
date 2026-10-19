import { describe, expect, it } from "vitest";

import {
  AUTOMATIONS,
  automationDefinition,
  insertTokenAt,
  isAutomationAvailable,
  renderAutomationMessage,
} from "@/lib/automations";

const SAMPLE = {
  client_name: "Maya",
  clinic_name: "Vela Dent",
  date: "Tue 21 Oct",
  time: "10:30",
  staff_name: "Dr. Arta",
};

describe("AUTOMATIONS", () => {
  it("lists the twelve automations in visit order", () => {
    expect(AUTOMATIONS.map((automation) => automation.kind)).toEqual([
      "BOOKING_CONFIRMATION",
      "NEW_PATIENT_WELCOME",
      "FIRST_REMINDER",
      "SECOND_REMINDER",
      "HIGH_RISK_REMINDER",
      "VISIT_CHANGED",
      "THANK_YOU",
      "MISSED_VISIT",
      "PAYMENT_REMINDER",
      "CHECKUP_DUE",
      "REBOOK",
      "WAITLIST_OFFER",
    ]);
  });

  it("keeps only the first reminder and the thank-you on Basic", () => {
    expect(AUTOMATIONS.filter((automation) => automation.basic).map((automation) => automation.kind)).toEqual([
      "FIRST_REMINDER",
      "THANK_YOU",
    ]);
  });

  it("never lets a reminder wait for review", () => {
    for (const kind of ["FIRST_REMINDER", "SECOND_REMINDER", "HIGH_RISK_REMINDER"] as const) {
      expect(automationDefinition(kind).reviewable).toBe(false);
    }
  });

  it("puts every default timing among its own options", () => {
    for (const automation of AUTOMATIONS) {
      if (automation.defaultTiming === null) {
        expect(automation.timingOptions).toEqual([]);
      } else {
        expect(automation.timingOptions).toContain(automation.defaultTiming);
      }
    }
  });

  it("writes default texts without em-dashes", () => {
    for (const automation of AUTOMATIONS) {
      expect(automation.defaultTemplate).not.toContain("—");
      expect(automation.defaultTemplate2 ?? "").not.toContain("—");
    }
  });
});

describe("isAutomationAvailable", () => {
  it("gates everything but the first reminder and thank-you behind Pro", () => {
    expect(isAutomationAvailable("SECOND_REMINDER", "BASIC")).toBe(false);
    expect(isAutomationAvailable("THANK_YOU", "BASIC")).toBe(true);
    expect(isAutomationAvailable("FIRST_REMINDER", "TRIAL")).toBe(true);
    expect(isAutomationAvailable("REBOOK", "PRO")).toBe(true);
    expect(isAutomationAvailable("WAITLIST_OFFER", "ADVANCED")).toBe(true);
  });
});

describe("renderAutomationMessage", () => {
  it("renders tokens outside the kind's whitelist as empty", () => {
    expect(
      renderAutomationMessage("THANK_YOU", "Hi {client_name} {time} {service} {notes} {unknown}", {
        client_name: "Maya",
        time: "10:30",
      })
    ).toBe("Hi Maya    ");
  });

  it("uses the default text when no template is stored", () => {
    expect(renderAutomationMessage("BOOKING_CONFIRMATION", null, SAMPLE)).toBe(
      "Hi Maya, your visit at Vela Dent is booked for Tue 21 Oct at 10:30. Reply here if you need to change it."
    );
  });

  it("treats a blank template as the default", () => {
    expect(renderAutomationMessage("MISSED_VISIT", "   ", SAMPLE)).toBe(
      "Hi Maya, we missed you today. Would you like to book a new time?"
    );
  });

  it("uses the cancelled text for a cancelled visit", () => {
    expect(renderAutomationMessage("VISIT_CHANGED", null, SAMPLE, "cancelled")).toBe(
      "Hi Maya, your visit on Tue 21 Oct at 10:30 has been cancelled. Reply here to book a new time."
    );
    expect(renderAutomationMessage("VISIT_CHANGED", null, SAMPLE, "moved")).toBe(
      "Hi Maya, your visit has moved to Tue 21 Oct at 10:30. Reply here if the new time doesn't suit you."
    );
  });

  it("keeps the reply-to-confirm wording on the first reminder by default", () => {
    expect(renderAutomationMessage("FIRST_REMINDER", null, SAMPLE)).toBe(
      "Hi Maya, this is a reminder for your appointment at 10:30 on Tue 21 Oct. Reply 1 to confirm or 2 to cancel."
    );
  });

  it("maps the legacy reminder default to the current one", () => {
    expect(
      renderAutomationMessage(
        "FIRST_REMINDER",
        "Hi {client_name}, this is a reminder for your appointment at {time} on {date}. Reply here if you need to reschedule.",
        SAMPLE
      )
    ).toContain("Reply 1 to confirm or 2 to cancel.");
  });

  it("offers the slot's date and time on a waiting-list offer", () => {
    expect(renderAutomationMessage("WAITLIST_OFFER", null, SAMPLE)).toBe(
      "Hi Maya, a slot has opened up on Tue 21 Oct at 10:30. Reply here if you'd like it."
    );
  });
});

describe("insertTokenAt", () => {
  it("inserts a token at the cursor and moves the cursor past it", () => {
    expect(insertTokenAt("Hi !", 3, "client_name")).toEqual({ text: "Hi {client_name}!", cursor: 16 });
  });
});
