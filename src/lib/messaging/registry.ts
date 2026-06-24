import type { ChannelAdapter, MessageChannel } from "./types";

/**
 * Resolves the adapter for a logical channel. The default registry starts empty
 * and stays empty until a real channel is wired (WhatsApp → Baileys), so an
 * unconfigured channel fails closed with a generic result instead of throwing
 * or leaking a provider name.
 */
export class ChannelRegistry {
  private readonly adapters = new Map<MessageChannel, ChannelAdapter>();

  register(adapter: ChannelAdapter): this {
    this.adapters.set(adapter.channel, adapter);
    return this;
  }

  get(channel: MessageChannel): ChannelAdapter | null {
    return this.adapters.get(channel) ?? null;
  }
}
