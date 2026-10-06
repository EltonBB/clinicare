import { normalizePhone } from "@/lib/inbox";
import { logger } from "@/lib/logger";

import { getMessagingRegistry } from "./configure";
import {
  IDEMPOTENCY_KEY_PATTERN,
  MAX_MESSAGE_BODY_LENGTH,
  MESSAGE_TOO_LONG_ERROR,
} from "./limits";
import { ChannelRegistry } from "./registry";
import { renderReminder } from "./render";
import {
  SendOutcomeUnknownError,
  type AdapterSendInput,
  type MessageChannel,
  type SendMessageInput,
  type SendMessageResult,
} from "./types";

/**
 * Canonicalizes a raw recipient address for a channel.
 *
 * Phone channels produce E.164 with a leading "+"; each adapter re-formats for
 * its provider (Twilio prefixes `whatsapp:`, Baileys strips the "+"). Returns
 * `null` when the address is unusable, so the dispatcher can fail closed.
 */
function canonicalizeRecipient(
  channel: MessageChannel,
  to: string
): string | null {
  if (channel === "EMAIL") {
    const email = to.trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
  }

  const phone = normalizePhone(to);
  const digits = phone.replace(/\D/g, "");
  // Match the worker's accepted E.164 range (6–15 digits). Enforcing the upper
  // bound here means an over-long number fails closed as `invalid_recipient`
  // rather than as a worker-400 → `provider_error` that would wrongly flag the
  // shared WhatsApp connection ERRORED.
  return digits.length >= 6 && digits.length <= 15 ? phone : null;
}

/**
 * The messaging seam's single entry point. Every outbound patient message goes
 * through here. Resolves the channel's adapter, canonicalizes the recipient,
 * renders the body under minimum-necessary rules, and returns a provider-neutral
 * result — never throwing, never surfacing a provider name or PHI.
 */
export async function sendMessage(
  input: SendMessageInput,
  registry: ChannelRegistry = getMessagingRegistry()
): Promise<SendMessageResult> {
  const adapter = registry.get(input.channel);
  if (!adapter) {
    return {
      ok: false,
      reason: "channel_unconfigured",
      error: "This messaging channel isn't connected yet.",
    };
  }

  const to = canonicalizeRecipient(input.channel, input.to);
  if (!to) {
    return {
      ok: false,
      reason: "invalid_recipient",
      error: "The recipient address looks invalid.",
    };
  }

  let adapterInput: AdapterSendInput;
  switch (input.message.kind) {
    case "appointment_reminder": {
      const reminderBody = renderReminder(input.message);
      if (!reminderBody.trim()) {
        // A custom template that renders to nothing (e.g. only unfilled tokens)
        // would otherwise fail deep in the adapter as a generic provider error
        // and retry forever — classify it here instead.
        return {
          ok: false,
          reason: "empty_message",
          error: "The reminder message is empty.",
        };
      }
      adapterInput = {
        businessId: input.businessId,
        to,
        body: reminderBody,
      };
      break;
    }
    case "freeform": {
      const body = input.message.body.trim();
      if (!body) {
        return {
          ok: false,
          reason: "empty_message",
          error: "The message is empty.",
        };
      }
      adapterInput = { businessId: input.businessId, to, body };
      break;
    }
    case "template": {
      adapterInput = {
        businessId: input.businessId,
        to,
        body: "",
        template: {
          id: input.message.templateId,
          variables: input.message.variables,
        },
      };
      break;
    }
  }

  if (adapterInput.body.length > MAX_MESSAGE_BODY_LENGTH) {
    return {
      ok: false,
      reason: "message_too_long",
      error: MESSAGE_TOO_LONG_ERROR,
    };
  }

  if (input.idempotencyKey !== undefined) {
    if (IDEMPOTENCY_KEY_PATTERN.test(input.idempotencyKey)) {
      adapterInput.idempotencyKey = input.idempotencyKey;
    } else {
      // A provider would refuse the whole send over a malformed key, so send it
      // unkeyed (exactly as before keys existed) and flag the bug.
      logger.warn("Outbound message idempotency key is malformed; sending without it.", {
        businessId: input.businessId,
        channel: input.channel,
        kind: input.message.kind,
      });
    }
  }

  try {
    const result = await adapter.send(adapterInput);
    return {
      ok: true,
      providerMessageId: result.providerMessageId,
      status: result.status,
      body: adapterInput.body,
    };
  } catch (error) {
    const uncertain = error instanceof SendOutcomeUnknownError;
    // Record-id-only, provider-neutral: never log PHI or a provider name.
    logger.error(
      uncertain ? "Outbound message delivery is uncertain." : "Outbound message send failed.",
      error,
      {
        businessId: input.businessId,
        channel: input.channel,
        kind: input.message.kind,
      }
    );
    return uncertain
      ? {
          ok: false,
          reason: "delivery_uncertain",
          error: "We couldn't confirm the message was delivered. It may have reached the recipient.",
        }
      : {
          ok: false,
          reason: "provider_error",
          error: "We couldn't send the message. Please try again.",
        };
  }
}

export { ChannelRegistry } from "./registry";
export {
  buildConfiguredRegistry,
  getMessagingRegistry,
} from "./configure";
export { DEFAULT_REMINDER_TEMPLATE, renderReminder } from "./render";
export { EchoAdapter } from "./adapters/echo";
export { BaileysWhatsAppAdapter } from "./adapters/baileys";
export { SendOutcomeUnknownError } from "./types";
export {
  BAILEYS_BRIDGE_HEADER,
  type WorkerInboundEvent,
  type WorkerSendRequest,
  type WorkerSendResponse,
} from "./baileys-contract";
export type {
  AdapterSendInput,
  AdapterSendResult,
  ChannelAdapter,
  MessageChannel,
  MessageDeliveryStatus,
  OutboundMessage,
  SendFailureReason,
  SendMessageInput,
  SendMessageResult,
} from "./types";
