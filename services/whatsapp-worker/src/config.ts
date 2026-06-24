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
  /** Shared secret for the app<->worker bridge (both directions). */
  bridgeSecret: required("BAILEYS_BRIDGE_SECRET"),
  /** The Next.js app's inbound webhook the worker POSTs messages/receipts to. */
  appWebhookUrl: required("APP_WEBHOOK_URL"),
  /** Same Postgres the app uses — the worker owns only its session tables. */
  databaseUrl: required("DATABASE_URL"),
};

/** Header carrying the bridge secret. Mirrors BAILEYS_BRIDGE_HEADER in the app. */
export const BRIDGE_HEADER = "x-vela-bridge-secret";
