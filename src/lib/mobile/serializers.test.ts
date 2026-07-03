import { describe, expect, it } from "vitest";

import {
  serializeAppointment,
  serializeMe,
  type AppointmentForMobile,
} from "@/lib/mobile/serializers";

describe("serializeMe", () => {
  const baseItem = {
    id: "staff_1",
    name: "Dr. Arta Krasniqi",
    role: "General Dentist",
    email: "arta@example.test",
    phone: "+38349220118",
    status: "ACTIVE" as const,
    isCheckedIn: true,
    shiftLabel: "08:30 - 17:00",
    canClock: true,
    clockDisabledReason: "",
  };

  it("maps ACTIVE/AWAY to lowercase and carries through identity", () => {
    const me = serializeMe({
      item: baseItem,
      clinicName: "Vela Dental",
      device: { deviceLabel: "iPhone 15 Pro", createdAt: new Date("2026-06-12T10:00:00.000Z") },
    });
    expect(me.status).toBe("active");
    expect(me.checkedIn).toBe(true);
    expect(me.clinicName).toBe("Vela Dental");
    expect(me.deviceLabel).toBe("iPhone 15 Pro");
    expect(me.pairedAtLabel.startsWith("Paired ")).toBe(true);
    expect(me.pairedAtLabel).toContain("2026");
  });

  it("carries through clock eligibility for the app to gate the button", () => {
    const me = serializeMe({
      item: { ...baseItem, isCheckedIn: false, canClock: false, clockDisabledReason: "No shift" },
      clinicName: "Vela Dental",
      device: { deviceLabel: "iPhone 15 Pro", createdAt: new Date("2026-06-12T10:00:00.000Z") },
    });
    expect(me.canClock).toBe(false);
    expect(me.clockDisabledReason).toBe("No shift");
  });

  it("falls back to a generic device label and maps AWAY", () => {
    const me = serializeMe({
      item: { ...baseItem, status: "AWAY" },
      clinicName: "Vela Dental",
      device: { deviceLabel: null, createdAt: new Date("2026-06-12T10:00:00.000Z") },
    });
    expect(me.status).toBe("away");
    expect(me.deviceLabel).toBe("This device");
  });
});

describe("serializeAppointment", () => {
  function appt(overrides: Partial<AppointmentForMobile> = {}): AppointmentForMobile {
    return {
      id: "a1",
      title: "Follow-up consultation",
      startAt: new Date("2026-06-25T09:00:00.000Z"),
      endAt: new Date("2026-06-25T09:30:00.000Z"),
      status: "CONFIRMED",
      notes: null,
      client: { name: "Liridon Berisha" },
      ...overrides,
    };
  }

  it("maps fields and keeps startMinutes consistent with startLabel (tz-independent)", () => {
    const m = serializeAppointment(appt(), "today");
    expect(m.patientName).toBe("Liridon Berisha");
    expect(m.service).toBe("Follow-up consultation");
    expect(m.startLabel).toMatch(/^\d{2}:\d{2}$/);
    const [h, min] = m.startLabel.split(":").map(Number);
    expect(m.startMinutes).toBe(h * 60 + min);
    expect(m.durationMin).toBe(30);
    expect(m.status).toBe("confirmed");
    expect(m.dayKey).toBe("today");
    expect(m.dateLabel.startsWith("Today, ")).toBe(true);
  });

  it("lowercases every status and passes notes through, omitting null", () => {
    expect(serializeAppointment(appt({ status: "PENDING" }), "today").status).toBe("pending");
    expect(serializeAppointment(appt({ status: "CANCELLED" }), "today").status).toBe("cancelled");
    expect(serializeAppointment(appt({ status: "COMPLETED" }), "today").status).toBe("completed");
    expect(serializeAppointment(appt({ notes: null }), "today").notes).toBeUndefined();
    expect(serializeAppointment(appt({ notes: "Confirm anesthetic" }), "today").notes).toBe(
      "Confirm anesthetic"
    );
  });

  it("labels tomorrow distinctly", () => {
    expect(serializeAppointment(appt(), "tomorrow").dateLabel.startsWith("Tomorrow, ")).toBe(true);
  });

  it("labels a day that's neither today nor tomorrow with its weekday", () => {
    const label = serializeAppointment(appt(), "2026-06-29").dateLabel;
    expect(label).not.toMatch(/^Today|^Tomorrow/);
    expect(label).toMatch(/^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}$/); // e.g. "Mon, Jun 29"
  });

  it("flags hasEnded once the appointment's end time has passed, regardless of status", () => {
    const NOW = new Date("2026-06-25T10:00:00.000Z"); // after the 09:00-09:30 fixture
    // Never marked completed/cancelled by anyone, but the clock has moved on.
    expect(serializeAppointment(appt({ status: "CONFIRMED" }), "today", NOW).hasEnded).toBe(true);
    const BEFORE = new Date("2026-06-25T09:15:00.000Z"); // mid-appointment
    expect(serializeAppointment(appt(), "today", BEFORE).hasEnded).toBe(false);
  });
});
