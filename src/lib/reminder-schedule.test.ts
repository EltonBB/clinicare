import { describe, expect, it } from "vitest";

import { reminderTypeForAppointment } from "@/lib/reminder-schedule";

const NOW = new Date("2026-06-23T08:00:00.000Z");

function hoursFromNow(hours: number) {
  return new Date(NOW.getTime() + hours * 60 * 60 * 1000);
}

function decide(
  overrides: Partial<Parameters<typeof reminderTypeForAppointment>[0]> = {}
) {
  return reminderTypeForAppointment({
    startsAt: hoursFromNow(10),
    now: NOW,
    send24HourReminder: true,
    send2HourReminder: true,
    firstReminderHours: 24,
    secondReminderHours: 2,
    sentTypes: new Set<string>(),
    ...overrides,
  });
}

describe("reminderTypeForAppointment", () => {
  it("never reminds a past (or now) appointment", () => {
    expect(decide({ startsAt: hoursFromNow(-1) })).toBeNull();
    expect(decide({ startsAt: NOW })).toBeNull();
  });

  it("sends the 24-hour reminder when only the first window is open", () => {
    // 10h out: inside the 24h window, outside the 2h window.
    expect(decide({ startsAt: hoursFromNow(10) })).toBe("TWENTY_FOUR_HOUR");
  });

  it("prefers the 2-hour reminder when both windows are open and unsent", () => {
    // 1h out: inside both windows — the second reminder takes precedence so a
    // single cron run never fires two reminders.
    expect(decide({ startsAt: hoursFromNow(1) })).toBe("TWO_HOUR");
  });

  /**
   * Regression test: this originally asserted TWENTY_FOUR_HOUR here, encoding
   * a real bug (Codex found it) rather than catching it. An appointment
   * discovered already inside the 2-hour window sends TWO_HOUR first (its
   * own window is narrower, so it opens later); the OLD code then let a
   * later hourly run fall through to TWENTY_FOUR_HOUR once TWO_HOUR was
   * marked sent, sending the longer-lead-time reminder AFTER the more
   * urgent one — backwards, and possibly minutes before the appointment.
   * Once the 2-hour reminder is out, the 24-hour one must never follow.
   */
  it("suppresses the 24-hour reminder once the more urgent 2-hour one was already sent", () => {
    expect(
      decide({ startsAt: hoursFromNow(1), sentTypes: new Set(["TWO_HOUR"]) })
    ).toBeNull();
  });

  it("returns null once both reminders have been sent", () => {
    expect(
      decide({
        startsAt: hoursFromNow(1),
        sentTypes: new Set(["TWO_HOUR", "TWENTY_FOUR_HOUR"]),
      })
    ).toBeNull();
  });

  it("fires at the exact window boundary (uses <=, not <)", () => {
    // Exactly 2h away → the 2-hour window's boundary instant fires.
    expect(decide({ startsAt: hoursFromNow(2) })).toBe("TWO_HOUR");
    // Exactly 24h away → past the 2h window, on the 24h boundary.
    expect(decide({ startsAt: hoursFromNow(24) })).toBe("TWENTY_FOUR_HOUR");
  });

  it("respects the per-reminder enable flags", () => {
    // 1h out but the 2-hour reminder is disabled → fall through to 24h.
    expect(
      decide({ startsAt: hoursFromNow(1), send2HourReminder: false })
    ).toBe("TWENTY_FOUR_HOUR");
    // Both disabled → nothing.
    expect(
      decide({
        startsAt: hoursFromNow(1),
        send2HourReminder: false,
        send24HourReminder: false,
      })
    ).toBeNull();
  });

  it("returns null for an appointment beyond both reminder windows", () => {
    expect(decide({ startsAt: hoursFromNow(30) })).toBeNull();
  });

  it("honours custom reminder-hour settings", () => {
    // first=48h, second=4h. 3h out → inside the 4h window → TWO_HOUR.
    expect(
      decide({
        startsAt: hoursFromNow(3),
        firstReminderHours: 48,
        secondReminderHours: 4,
      })
    ).toBe("TWO_HOUR");
    // 40h out → outside 4h, inside 48h → TWENTY_FOUR_HOUR.
    expect(
      decide({
        startsAt: hoursFromNow(40),
        firstReminderHours: 48,
        secondReminderHours: 4,
      })
    ).toBe("TWENTY_FOUR_HOUR");
  });

  /**
   * Codex's exact reported scenario, run as two sequential hourly cron
   * passes rather than one static call. NOW is 08:00; the appointment is
   * fixed at 10:30 (hoursFromNow(2.5)). The first pass runs at 09:00 — 1.5h
   * out, inside the 2h window — and sends TWO_HOUR. The next hourly pass, an
   * hour later at 10:00 (0.5h out, TWO_HOUR now in sentTypes), must NOT then
   * send TWENTY_FOUR_HOUR — that would arrive 30 minutes before the
   * appointment, after the more urgent reminder already went out.
   */
  it("does not backfill the 24-hour reminder on a later run after the 2-hour one already fired", () => {
    const startsAt = hoursFromNow(2.5); // 10:30, fixed for both simulated runs
    const sentTypes = new Set<string>();

    const firstRun = reminderTypeForAppointment({
      startsAt,
      now: hoursFromNow(1), // 09:00 — appointment is 1.5h out
      send24HourReminder: true,
      send2HourReminder: true,
      firstReminderHours: 24,
      secondReminderHours: 2,
      sentTypes,
    });
    expect(firstRun).toBe("TWO_HOUR");
    if (firstRun) {
      sentTypes.add(firstRun);
    }

    const secondRun = reminderTypeForAppointment({
      startsAt,
      now: hoursFromNow(2), // 10:00, an hour later — appointment is 0.5h out
      send24HourReminder: true,
      send2HourReminder: true,
      firstReminderHours: 24,
      secondReminderHours: 2,
      sentTypes,
    });
    expect(secondRun).toBeNull();
  });
});
