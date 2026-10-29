import { z } from "zod";

/**
 * Paddle settings, all from env so sandbox → live is a config change, not a
 * code change. Missing or invalid settings make {@link paddleConfig} null:
 * billing then shows as unavailable instead of failing.
 *
 * PADDLE_PRICE_IDS holds the eight catalog prices (scripts/paddle-setup.mjs
 * prints it): plan × interval × with/without the free trial. The no-trial
 * price is for a clinic that has already had its one trial.
 */
const pricePair = z.object({ trial: z.string().min(1), noTrial: z.string().min(1) });
const planPrices = z.object({ MONTH: pricePair, YEAR: pricePair });
const priceTableSchema = z.object({ BASIC: planPrices, PRO: planPrices });

export type PriceTable = z.infer<typeof priceTableSchema>;
export type PaidPlan = keyof PriceTable;
export type PaidInterval = "MONTH" | "YEAR";

export type PaddleConfig = {
  env: "sandbox" | "production";
  apiBase: string;
  apiKey: string;
  webhookSecret: string;
  clientToken: string;
  prices: PriceTable;
};

type EnvSource = Record<string, string | undefined>;

export function paddleConfigFrom(env: EnvSource): PaddleConfig | null {
  const mode = env.PADDLE_ENV;
  if (mode !== "sandbox" && mode !== "production") return null;
  const apiKey = env.PADDLE_API_KEY?.trim();
  const webhookSecret = env.PADDLE_WEBHOOK_SECRET?.trim();
  const clientToken = env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN?.trim();
  if (!apiKey || !webhookSecret || !clientToken || !env.PADDLE_PRICE_IDS) return null;

  let prices: PriceTable;
  try {
    const parsed = priceTableSchema.safeParse(JSON.parse(env.PADDLE_PRICE_IDS));
    if (!parsed.success) return null;
    prices = parsed.data;
  } catch {
    return null;
  }

  return {
    env: mode,
    apiBase: mode === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com",
    apiKey,
    webhookSecret,
    clientToken,
    prices,
  };
}

export function paddleConfig(): PaddleConfig | null {
  return paddleConfigFrom(process.env);
}

export type PriceInfo = { plan: PaidPlan; interval: PaidInterval; trial: boolean };

/** Which plan, interval and trial a Paddle price id stands for. */
export function priceLookup(prices: PriceTable): Map<string, PriceInfo> {
  const lookup = new Map<string, PriceInfo>();
  for (const plan of ["BASIC", "PRO"] as const) {
    for (const interval of ["MONTH", "YEAR"] as const) {
      const pair = prices[plan][interval];
      lookup.set(pair.trial, { plan, interval, trial: true });
      lookup.set(pair.noTrial, { plan, interval, trial: false });
    }
  }
  return lookup;
}
