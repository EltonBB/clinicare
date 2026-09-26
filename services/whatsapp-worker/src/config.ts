import "dotenv/config";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT?.trim() || "8081"),
  /** Secret for the app -> worker control plane (pair/send/status). */
  bridgeSecret: required("BAILEYS_BRIDGE_SECRET"),
  /** The Next.js app's inbound webhook the worker POSTs messages/receipts to. */
  appWebhookUrl: required("APP_WEBHOOK_URL"),
  /**
   * Signs the worker -> app webhook (HMAC + timestamp). Must equal the app's
   * BAILEYS_WEBHOOK_SECRET and differ from the bridge secret. Optional only so an
   * existing deployment keeps working while it is rolled out; unset means the
   * webhook is authenticated by the shared bridge secret alone.
   */
  appWebhookSecret: process.env.APP_WEBHOOK_SECRET?.trim() || undefined,
  /** Same Postgres the app uses — the worker owns only its session tables. */
  databaseUrl: required("DATABASE_URL"),
};

// One secret for both directions is exactly what signing exists to avoid.
if (config.appWebhookSecret && config.appWebhookSecret === config.bridgeSecret) {
  throw new Error("APP_WEBHOOK_SECRET must be a different value from BAILEYS_BRIDGE_SECRET.");
}

/** Header carrying the bridge secret. Mirrors BAILEYS_BRIDGE_HEADER in the app. */
export const BRIDGE_HEADER = "x-vela-bridge-secret";
