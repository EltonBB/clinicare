import type { MessageDeliveryStatus } from "@prisma/client";

/**
 * The messaging seam (ROADMAP Step 1).
 *
 * Every outbound patient message — reminders, inbox replies, future email —
 * flows through `sendMessage(channel, payload)`. Feature code names a logical
 * CHANNEL; the concrete provider (Baileys / Twilio / Resend) is resolved inside
 * this module and never leaks past it. This is the single place where:
 *   - provider swaps stay cheap (portability seam — CLAUDE.md),
 *   - HIPAA minimum-necessary content is structural, not operator discipline,
 *   - an audit hook can attach to every send in exactly one place.
 *
 * Provider SDKs / raw `fetch` calls live ONLY inside adapters
 * (`./adapters/*`). Nothing in feature code may import an adapter or a provider
 * module directly — it goes through `sendMessage`.
 */

/** Provider-neutral delivery status (re-exported from Prisma's enum). */
export type { MessageDeliveryStatus };

/**
 * Logical medium a message travels on. The provider behind it is an internal
 * detail resolved by the registry — feature code and UI copy never name it.
 */
export type MessageChannel = "WHATSAPP" | "SMS" | "EMAIL";

/**
 * What to send. A discriminated union by `kind` so the type system — not
 * operator discipline — enforces minimum-necessary content. The
 * `appointment_reminder` kind carries NO field for clinical detail: a diagnosis
 * or treatment simply cannot be passed through it.
 */
export type OutboundMessage =
  | {
      kind: "appointment_reminder";
      recipientName: string;
      appointmentDate: string;
      appointmentTime: string;
      staffName?: string;
      /** The business's configured template; defaults to a min-necessary one. */
      template?: string;
    }
  | {
      kind: "freeform";
      /** Operator-authored text (e.g. an inbox reply typed by staff). */
      body: string;
    }
  | {
      kind: "template";
      /** Provider-side approved template reference (e.g. a content SID). */
      templateId: string;
      variables: Record<string, string>;
    };

export type SendMessageInput = {
  channel: MessageChannel;
  /** Tenant scope — every send is attributable to one workspace. */
  businessId: string;
  /** Raw recipient address (phone or email); canonicalized by the seam. */
  to: string;
  message: OutboundMessage;
};

export type SendFailureReason =
  | "channel_unconfigured"
  | "invalid_recipient"
  | "empty_message"
  | "message_too_long"
  | "provider_error";

export type SendMessageResult =
  | {
      ok: true;
      providerMessageId: string | null;
      status: MessageDeliveryStatus;
      /**
       * The exact text that was sent (rendered under minimum-necessary rules for
       * reminders, trimmed for freeform). Empty for provider-side templates.
       * Callers store this so the saved message matches what actually went out.
       */
      body: string;
    }
  | {
      ok: false;
      reason: SendFailureReason;
      /** Customer-safe, provider-neutral copy. Never carries provider/PHI. */
      error: string;
    };

/** Resolved, provider-ready payload handed to an adapter. */
export type AdapterSendInput = {
  businessId: string;
  /** Canonical recipient: E.164 with a leading "+" for phone; lowercased email. */
  to: string;
  /** Rendered message text for freeform/reminder sends. Empty for templates. */
  body: string;
  /** Set only for template sends; the adapter resolves it provider-side. */
  template?: { id: string; variables: Record<string, string> };
};

export type AdapterSendResult = {
  providerMessageId: string | null;
  status: MessageDeliveryStatus;
};

/**
 * A channel adapter wraps exactly one provider and is the ONLY place a provider
 * SDK / HTTP call may live. Adapters throw on provider failure; the dispatcher
 * translates that into a generic, customer-safe {@link SendMessageResult}.
 */
export interface ChannelAdapter {
  readonly channel: MessageChannel;
  send(input: AdapterSendInput): Promise<AdapterSendResult>;
}
