import { describe, expect, it } from "vitest";

import {
  ChannelRegistry,
  EchoAdapter,
  renderReminder,
  sendMessage,
  SendOutcomeUnknownError,
  type AdapterSendInput,
  type AdapterSendResult,
  type ChannelAdapter,
} from "./index";
import { MAX_MESSAGE_BODY_LENGTH, MESSAGE_TOO_LONG_ERROR } from "./limits";

function registryWith(...adapters: ChannelAdapter[]): ChannelRegistry {
  const registry = new ChannelRegistry();
  for (const adapter of adapters) {
    registry.register(adapter);
  }
  return registry;
}

describe("renderReminder (minimum-necessary)", () => {
  it("fills only name, date, time, and staff", () => {
    const body = renderReminder({
      kind: "appointment_reminder",
      recipientName: "Mira",
      appointmentDate: "Mon, Jun 24",
      appointmentTime: "3:00 PM",
      staffName: "Dr. Leka",
      template: "Hi {client_name}, see {staff_name} at {time} on {date}.",
    });
    expect(body).toBe("Hi Mira, see Dr. Leka at 3:00 PM on Mon, Jun 24.");
  });

  it("renders any clinical token empty — a diagnosis can never ride out", () => {
    const body = renderReminder({
      kind: "appointment_reminder",
      recipientName: "Mira",
      appointmentDate: "Mon, Jun 24",
      appointmentTime: "3:00 PM",
      template: "Hi {client_name}, {service} {diagnosis} at {time}.",
    });
    expect(body).toBe("Hi Mira,   at 3:00 PM.");
    expect(body).not.toContain("service");
    expect(body).not.toContain("diagnosis");
  });

  it("falls back to the default min-necessary template", () => {
    const body = renderReminder({
      kind: "appointment_reminder",
      recipientName: "Mira",
      appointmentDate: "Jun 24",
      appointmentTime: "3 PM",
    });
    expect(body).toContain("Mira");
    expect(body).toContain("3 PM");
    expect(body).toContain("Jun 24");
  });

  // Codex #130: onboarding saved the default into each workspace, so a workspace
  // created while the old wording was the default still holds it, and its
  // patients would never learn they can reply 1 or 2.
  it("sends the current default to a workspace still holding the old default, word for word", () => {
    const body = renderReminder({
      kind: "appointment_reminder",
      recipientName: "Mira",
      appointmentDate: "Jun 24",
      appointmentTime: "3 PM",
      template:
        "  Hi {client_name}, this is a reminder for your appointment at {time} on {date}. Reply here if you need to reschedule. ",
    });
    expect(body).toBe("Hi Mira, this is a reminder for your appointment at 3 PM on Jun 24. Reply 1 to confirm or 2 to cancel.");
  });

  it("leaves a clinic's own wording alone, even when it mentions rescheduling", () => {
    const body = renderReminder({
      kind: "appointment_reminder",
      recipientName: "Mira",
      appointmentDate: "Jun 24",
      appointmentTime: "3 PM",
      template: "Hi {client_name}, see you at {time} on {date}. Reply here if you need to reschedule.",
    });
    expect(body).toBe("Hi Mira, see you at 3 PM on Jun 24. Reply here if you need to reschedule.");
  });
});

describe("sendMessage dispatch", () => {
  it("routes to the registered adapter and returns a neutral result", async () => {
    const echo = new EchoAdapter("WHATSAPP");
    const result = await sendMessage(
      {
        channel: "WHATSAPP",
        businessId: "biz_1",
        to: "+1 (415) 555-0100",
        message: { kind: "freeform", body: "  Hello there  " },
      },
      registryWith(echo)
    );

    expect(result).toEqual({
      ok: true,
      providerMessageId: "echo_1",
      status: "SENT",
      body: "Hello there",
    });
    // Recipient canonicalized (E.164 + kept) and body trimmed before the adapter.
    expect(echo.sent[0]?.to).toBe("+14155550100");
    expect(echo.sent[0]?.body).toBe("Hello there");
  });

  it("renders an appointment reminder to a min-necessary body", async () => {
    const echo = new EchoAdapter("WHATSAPP");
    await sendMessage(
      {
        channel: "WHATSAPP",
        businessId: "biz_1",
        to: "+14155550100",
        message: {
          kind: "appointment_reminder",
          recipientName: "Mira",
          appointmentDate: "Jun 24",
          appointmentTime: "3 PM",
        },
      },
      registryWith(echo)
    );
    expect(echo.sent[0]?.body).toContain("Mira");
    expect(echo.sent[0]?.template).toBeUndefined();
  });

  it("passes templates through without a rendered body", async () => {
    const echo = new EchoAdapter("WHATSAPP");
    await sendMessage(
      {
        channel: "WHATSAPP",
        businessId: "biz_1",
        to: "+14155550100",
        message: {
          kind: "template",
          templateId: "HX123",
          variables: { "1": "Mira" },
        },
      },
      registryWith(echo)
    );
    expect(echo.sent[0]?.body).toBe("");
    expect(echo.sent[0]?.template).toEqual({
      id: "HX123",
      variables: { "1": "Mira" },
    });
  });

  it("fails closed when the channel has no adapter", async () => {
    const result = await sendMessage(
      {
        channel: "SMS",
        businessId: "biz_1",
        to: "+14155550100",
        message: { kind: "freeform", body: "hi" },
      },
      registryWith(new EchoAdapter("WHATSAPP"))
    );
    expect(result).toEqual({
      ok: false,
      reason: "channel_unconfigured",
      error: expect.any(String),
    });
  });

  it("classifies an empty-rendered reminder template as empty_message", async () => {
    const echo = new EchoAdapter("WHATSAPP");
    const result = await sendMessage(
      {
        channel: "WHATSAPP",
        businessId: "biz_1",
        to: "+14155550100",
        message: {
          kind: "appointment_reminder",
          recipientName: "Mira",
          appointmentDate: "Jun 24",
          appointmentTime: "3 PM",
          // Only unfilled (clinical) tokens — renders to empty.
          template: "{service}{diagnosis}",
        },
      },
      registryWith(echo)
    );
    expect(result.ok).toBe(false);
    // Caught at the seam, not surfaced as a generic provider_error.
    if (!result.ok) expect(result.reason).toBe("empty_message");
    expect(echo.sent).toHaveLength(0);
  });

  it("rejects an empty freeform message", async () => {
    const echo = new EchoAdapter("WHATSAPP");
    const result = await sendMessage(
      {
        channel: "WHATSAPP",
        businessId: "biz_1",
        to: "+14155550100",
        message: { kind: "freeform", body: "   " },
      },
      registryWith(echo)
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("empty_message");
    expect(echo.sent).toHaveLength(0);
  });

  it("rejects an over-limit body before sending (stored == sent invariant)", async () => {
    const echo = new EchoAdapter("WHATSAPP");
    const result = await sendMessage(
      {
        channel: "WHATSAPP",
        businessId: "biz_1",
        to: "+14155550100",
        message: { kind: "freeform", body: "x".repeat(8001) },
      },
      registryWith(echo)
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("message_too_long");
    // Never handed to the adapter — so nothing truncated is recorded as full.
    expect(echo.sent).toHaveLength(0);
  });

  // The follow-up send refuses an over-limit edited body up front with these same
  // values (Codex #130), so the cap and its wording must be exactly the seam's own.
  it("sends a body of exactly the shared cap and refuses one character more with the shared wording", async () => {
    const echo = new EchoAdapter("WHATSAPP");
    const send = (body: string) =>
      sendMessage(
        { channel: "WHATSAPP", businessId: "biz_1", to: "+14155550100", message: { kind: "freeform", body } },
        registryWith(echo)
      );

    expect(MAX_MESSAGE_BODY_LENGTH).toBe(8000);
    expect((await send("x".repeat(MAX_MESSAGE_BODY_LENGTH))).ok).toBe(true);
    expect(await send("x".repeat(MAX_MESSAGE_BODY_LENGTH + 1))).toEqual({
      ok: false,
      reason: "message_too_long",
      error: MESSAGE_TOO_LONG_ERROR,
    });
    expect(echo.sent).toHaveLength(1);
  });

  it("rejects an unusable phone recipient", async () => {
    const result = await sendMessage(
      {
        channel: "WHATSAPP",
        businessId: "biz_1",
        to: "abc",
        message: { kind: "freeform", body: "hi" },
      },
      registryWith(new EchoAdapter("WHATSAPP"))
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_recipient");
  });

  it("rejects an over-long phone (>15 digits) as invalid, not provider_error", async () => {
    const echo = new EchoAdapter("WHATSAPP");
    const result = await sendMessage(
      {
        channel: "WHATSAPP",
        businessId: "biz_1",
        to: "+1234567890123456", // 16 digits — past the worker's ^\d{6,15}$
        message: { kind: "freeform", body: "hi" },
      },
      registryWith(echo)
    );
    expect(result.ok).toBe(false);
    // invalid_recipient (not provider_error) so a bad number can't ERROR the link.
    if (!result.ok) expect(result.reason).toBe("invalid_recipient");
    expect(echo.sent).toHaveLength(0);
  });

  it("canonicalizes and validates email recipients", async () => {
    const echo = new EchoAdapter("EMAIL");
    const ok = await sendMessage(
      {
        channel: "EMAIL",
        businessId: "biz_1",
        to: "  Mira@Clinic.CO  ",
        message: { kind: "freeform", body: "hi" },
      },
      registryWith(echo)
    );
    expect(ok.ok).toBe(true);
    expect(echo.sent[0]?.to).toBe("mira@clinic.co");

    const bad = await sendMessage(
      {
        channel: "EMAIL",
        businessId: "biz_1",
        to: "not-an-email",
        message: { kind: "freeform", body: "hi" },
      },
      registryWith(echo)
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe("invalid_recipient");
  });

  it("translates an adapter failure into a generic result without throwing", async () => {
    const throwing: ChannelAdapter = {
      channel: "WHATSAPP",
      async send(): Promise<AdapterSendResult> {
        throw new Error("provider exploded with +14155550100 in the message");
      },
    };
    const result = await sendMessage(
      {
        channel: "WHATSAPP",
        businessId: "biz_1",
        to: "+14155550100",
        message: { kind: "freeform", body: "hi" },
      },
      registryWith(throwing)
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("provider_error");
      // Customer-safe copy: no provider name, no leaked recipient digits.
      expect(result.error).not.toContain("provider exploded");
      expect(result.error).not.toContain("14155550100");
    }
  });

  it("reports a send whose outcome is unknown as delivery_uncertain, never as a retryable provider_error", async () => {
    const uncertain: ChannelAdapter = {
      channel: "WHATSAPP",
      async send(): Promise<AdapterSendResult> {
        throw new SendOutcomeUnknownError("worker timed out mid-send with +14155550100");
      },
    };
    const result = await sendMessage(
      { channel: "WHATSAPP", businessId: "biz_1", to: "+14155550100", message: { kind: "freeform", body: "Hi" } },
      registryWith(uncertain)
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("delivery_uncertain");
      expect(result.error).not.toContain("14155550100");
    }
  });

  it("passes a well-formed idempotency key to the adapter and drops a malformed one", async () => {
    const seen: AdapterSendInput[] = [];
    const recording: ChannelAdapter = {
      channel: "WHATSAPP",
      async send(input): Promise<AdapterSendResult> {
        seen.push(input);
        return { providerMessageId: "m", status: "SENT" };
      },
    };
    const base = { channel: "WHATSAPP" as const, businessId: "biz_1", to: "+14155550100" };

    await sendMessage({ ...base, message: { kind: "freeform", body: "Hi" }, idempotencyKey: "follow-up:d1" }, registryWith(recording));
    // Sent unkeyed rather than refused: a malformed key is a bug, not a reason to drop the message.
    await sendMessage({ ...base, message: { kind: "freeform", body: "Hi" }, idempotencyKey: "has a space" }, registryWith(recording));
    await sendMessage({ ...base, message: { kind: "freeform", body: "Hi" } }, registryWith(recording));

    expect(seen.map((input) => input.idempotencyKey)).toEqual(["follow-up:d1", undefined, undefined]);
  });
});
