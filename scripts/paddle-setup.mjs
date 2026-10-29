// Creates (or finds) Vela's Paddle catalog and webhook destination.
//
//   PADDLE_ENV=sandbox PADDLE_API_KEY=... APP_URL=https://<preview-or-prod-host> node scripts/paddle-setup.mjs
//
// Safe to re-run: every product, price and destination is matched by the
// custom_data key / URL it was created with, and only what's missing is made.
// A Vercel preview sits behind Vercel's login, which would turn Paddle's
// webhooks away: set VERCEL_PROTECTION_BYPASS to the project's "Protection
// Bypass for Automation" secret and it rides on the webhook URL.
//
// Writes PADDLE_PRICE_IDS and PADDLE_WEBHOOK_SECRET to .env.paddle.local
// (git-ignored) instead of printing them, so the secret never lands in a
// terminal log; copy both into the Vercel environment from there.
//
// Prices are tax-inclusive (`tax_mode: "internal"`): a clinic pays exactly the
// listed price. Euro countries get a fixed euro price; everyone else gets
// Paddle's automatic conversion of the dollar price (switch "automatic currency
// conversion" on in the Paddle dashboard).
import { writeFileSync } from "node:fs";
import process from "node:process";

const env = process.env.PADDLE_ENV;
const apiKey = process.env.PADDLE_API_KEY;
const appUrl = process.env.APP_URL?.replace(/\/+$/, "");
const protectionBypass = process.env.VERCEL_PROTECTION_BYPASS?.trim();
if ((env !== "sandbox" && env !== "production") || !apiKey || !appUrl?.startsWith("https://")) {
  console.error("Set PADDLE_ENV (sandbox|production), PADDLE_API_KEY and an https APP_URL.");
  process.exit(1);
}
const apiBase = env === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";

// The euro area plus the countries that use the euro without being in it
// (Kosovo first among them: the pilot market).
const EURO_COUNTRIES = [
  "AT", "BE", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES",
  "XK", "ME", "AD", "MC", "SM", "VA",
];

const TRIAL_DAYS = 14;
const PLANS = [
  { plan: "BASIC", name: "Vela Basic", month: 3900, year: 42900 },
  { plan: "PRO", name: "Vela Pro", month: 7900, year: 86900 },
];
const SUBSCRIPTION_EVENTS = [
  "subscription.created",
  "subscription.updated",
  "subscription.activated",
  "subscription.trialing",
  "subscription.past_due",
  "subscription.paused",
  "subscription.resumed",
  "subscription.canceled",
];

async function paddle(path, init = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const code = json?.error?.code ?? "unknown";
    const detail = json?.error?.detail ?? "";
    throw new Error(`${init.method ?? "GET"} ${path} failed: ${response.status} ${code} ${detail}`);
  }
  return json;
}

async function listAll(path) {
  const items = [];
  let next = `${path}${path.includes("?") ? "&" : "?"}per_page=200`;
  while (next) {
    const page = await paddle(next);
    items.push(...page.data);
    const nextUrl = page.meta?.pagination?.has_more ? page.meta.pagination.next : null;
    next = nextUrl ? nextUrl.replace(apiBase, "") : null;
  }
  return items;
}

async function ensureProduct({ plan, name }) {
  const existing = (await listAll("/products?status=active")).find((product) => product.custom_data?.vela_plan === plan);
  if (existing) return existing.id;
  const created = await paddle("/products", {
    method: "POST",
    body: { name, tax_category: "saas", custom_data: { vela_plan: plan } },
  });
  console.log(`Created product ${name}.`);
  return created.data.id;
}

async function ensurePrice(productId, { plan, name }, interval, amount, trial) {
  const key = `${plan}_${interval}_${trial ? "TRIAL" : "NO_TRIAL"}`;
  const existing = (await listAll(`/prices?product_id=${productId}&status=active`)).find(
    (price) => price.custom_data?.vela_price === key
  );
  if (existing) return existing.id;
  const cadence = interval === "MONTH" ? "Monthly" : "Yearly";
  const created = await paddle("/prices", {
    method: "POST",
    body: {
      product_id: productId,
      description: `${name}, ${cadence.toLowerCase()}${trial ? `, ${TRIAL_DAYS}-day free trial` : ""}`,
      name: `${cadence}${trial ? ` with ${TRIAL_DAYS}-day free trial` : ""}`,
      unit_price: { amount: String(amount), currency_code: "USD" },
      unit_price_overrides: [{ country_codes: EURO_COUNTRIES, unit_price: { amount: String(amount), currency_code: "EUR" } }],
      billing_cycle: { interval: interval === "MONTH" ? "month" : "year", frequency: 1 },
      ...(trial ? { trial_period: { interval: "day", frequency: TRIAL_DAYS } } : {}),
      tax_mode: "internal",
      quantity: { minimum: 1, maximum: 1 },
      custom_data: { vela_price: key },
    },
  });
  console.log(`Created price ${key}.`);
  return created.data.id;
}

async function ensureWebhook() {
  const destination = `${appUrl}/api/webhooks/paddle${
    protectionBypass ? `?x-vercel-protection-bypass=${encodeURIComponent(protectionBypass)}` : ""
  }`;
  const existing = (await paddle("/notification-settings")).data.find((setting) => setting.destination === destination);
  if (existing) return existing.endpoint_secret_key;
  const created = await paddle("/notification-settings", {
    method: "POST",
    body: {
      description: "Vela subscriptions",
      destination,
      type: "url",
      api_version: 1,
      subscribed_events: SUBSCRIPTION_EVENTS,
      include_sensitive_fields: false,
    },
  });
  console.log(`Created webhook destination ${appUrl}/api/webhooks/paddle.`);
  return created.data.endpoint_secret_key;
}

const prices = {};
for (const plan of PLANS) {
  const productId = await ensureProduct(plan);
  prices[plan.plan] = {};
  for (const [interval, amount] of [["MONTH", plan.month], ["YEAR", plan.year]]) {
    prices[plan.plan][interval] = {
      trial: await ensurePrice(productId, plan, interval, amount, true),
      noTrial: await ensurePrice(productId, plan, interval, amount, false),
    };
  }
}
const webhookSecret = await ensureWebhook();

writeFileSync(
  ".env.paddle.local",
  `# Generated by scripts/paddle-setup.mjs (${env}). Copy into the Vercel environment; never commit.\n` +
    `PADDLE_ENV=${env}\n` +
    `PADDLE_PRICE_IDS=${JSON.stringify(prices)}\nPADDLE_WEBHOOK_SECRET=${webhookSecret}\n`
);
console.log("Done. Price ids and the webhook secret are in .env.paddle.local.");
