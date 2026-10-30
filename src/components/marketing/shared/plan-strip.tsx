import { paddleConfig } from "@/lib/paddle/paddle-config";

import { type PlanPricing, PlanStripInteractive } from "./plan-strip-interactive";

/**
 * Reads the billing setup on the server and hands the browser only what's
 * public: the environment, the client token and the price ids to show in the
 * visitor's own currency.
 */
export function planPricing(): PlanPricing {
  const config = paddleConfig();
  return {
    paddle: config ? { env: config.env, clientToken: config.clientToken } : null,
    previewPriceIds: config
      ? {
          basic: { MONTH: config.prices.BASIC.MONTH.noTrial, YEAR: config.prices.BASIC.YEAR.noTrial },
          pro: { MONTH: config.prices.PRO.MONTH.noTrial, YEAR: config.prices.PRO.YEAR.noTrial },
        }
      : null,
  };
}

/** The two plans as one split strip (used on Home and Pricing, always this one component). */
export function PlanStrip() {
  return <PlanStripInteractive pricing={planPricing()} />;
}
