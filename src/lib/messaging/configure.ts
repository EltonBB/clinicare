import { BaileysWhatsAppAdapter } from "./adapters/baileys";
import { ChannelRegistry } from "./registry";

/**
 * Builds the channel registry from environment configuration.
 *
 * Only channels whose config is present register an adapter; everything else
 * stays unconfigured and fails closed in {@link sendMessage}. WhatsApp resolves
 * to the Baileys worker (the sole WhatsApp provider). Email via Resend can
 * register here later.
 */
export function buildConfiguredRegistry(
  env: Record<string, string | undefined> = process.env
): ChannelRegistry {
  const registry = new ChannelRegistry();

  const workerUrl = env.BAILEYS_WORKER_URL?.trim();
  const bridgeSecret = env.BAILEYS_BRIDGE_SECRET?.trim();
  if (workerUrl && bridgeSecret) {
    registry.register(
      new BaileysWhatsAppAdapter({ workerUrl, secret: bridgeSecret })
    );
  }

  return registry;
}

let cached: ChannelRegistry | null = null;

/** Process-wide configured registry, built once from the environment. */
export function getMessagingRegistry(): ChannelRegistry {
  if (!cached) {
    cached = buildConfiguredRegistry();
  }
  return cached;
}
