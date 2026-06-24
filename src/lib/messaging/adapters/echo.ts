import type {
  AdapterSendInput,
  AdapterSendResult,
  ChannelAdapter,
  MessageChannel,
} from "../types";

/**
 * A no-op adapter that records sends in memory instead of contacting any
 * provider. Used by the seam's unit tests and safe for local development.
 * NEVER register this in production — it silently swallows real messages.
 */
export class EchoAdapter implements ChannelAdapter {
  readonly channel: MessageChannel;
  readonly sent: AdapterSendInput[] = [];

  constructor(channel: MessageChannel) {
    this.channel = channel;
  }

  async send(input: AdapterSendInput): Promise<AdapterSendResult> {
    this.sent.push(input);
    return { providerMessageId: `echo_${this.sent.length}`, status: "SENT" };
  }
}
