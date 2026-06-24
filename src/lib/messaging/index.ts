import { normalizePhone } from "@/lib/inbox";
import { logger } from "@/lib/logger";

import { getMessagingRegistry } from "./configure";
import { ChannelRegistry } from "./registry";
import { renderReminder } from "./render";

/**
 * Maximum send-body length. MUST mirror the worker's cap
 * (`services/whatsapp-worker/src/index.ts`). The seam rejects an over-limit body
 * here so the stored message body always equals what the worker actually sends —
 * never a truncated send recorded as the full text.
 */
const MAX_MESSAGE_BODY = 8000;
import type {
  AdapterSendInput,
  MessageChannel,
  SendMessageInput,
  SendMessageResult,
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
      adapterInput = {
        businessId: input.businessId,
        to,
        body: renderReminder(input.message),
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

  if (adapterInput.body.length > MAX_MESSAGE_BODY) {
    return {
      ok: false,
      reason: "message_too_long",
      error: "The message is too long to send.",
    };
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
    // Record-id-only, provider-neutral: never log PHI or a provider name.
    logger.error("Outbound message send failed.", error, {
      businessId: input.businessId,
      channel: input.channel,
      kind: input.message.kind,
    });
    return {
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
  resetMessagingRegistry,
} from "./configure";
export { DEFAULT_REMINDER_TEMPLATE, renderReminder } from "./render";
export { EchoAdapter } from "./adapters/echo";
export { BaileysWhatsAppAdapter } from "./adapters/baileys";
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
