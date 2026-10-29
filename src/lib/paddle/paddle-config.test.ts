import { describe, expect, it } from "vitest";

import { paddleConfigFrom, priceLookup } from "./paddle-config";

const PRICES = {
  BASIC: { MONTH: { trial: "pri_bm_t", noTrial: "pri_bm" }, YEAR: { trial: "pri_by_t", noTrial: "pri_by" } },
  PRO: { MONTH: { trial: "pri_pm_t", noTrial: "pri_pm" }, YEAR: { trial: "pri_py_t", noTrial: "pri_py" } },
};

const ENV = {
  PADDLE_ENV: "sandbox",
  PADDLE_API_KEY: "pdl_sdbx_apikey_x",
  PADDLE_WEBHOOK_SECRET: "pdl_ntfset_x",
  PADDLE_PRICE_IDS: JSON.stringify(PRICES),
  NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: "test_token",
};

describe("paddleConfigFrom", () => {
  it("reads a complete sandbox configuration", () => {
    expect(paddleConfigFrom(ENV)).toEqual({
      env: "sandbox",
      apiBase: "https://sandbox-api.paddle.com",
      apiKey: "pdl_sdbx_apikey_x",
      webhookSecret: "pdl_ntfset_x",
      clientToken: "test_token",
      prices: PRICES,
    });
  });

  it("points production at the live API", () => {
    expect(paddleConfigFrom({ ...ENV, PADDLE_ENV: "production" })?.apiBase).toBe("https://api.paddle.com");
  });

  it("is null (billing off, nothing crashes) when anything is missing or invalid", () => {
    expect(paddleConfigFrom({})).toBeNull();
    expect(paddleConfigFrom({ ...ENV, PADDLE_API_KEY: "" })).toBeNull();
    expect(paddleConfigFrom({ ...ENV, PADDLE_ENV: "staging" })).toBeNull();
    expect(paddleConfigFrom({ ...ENV, PADDLE_PRICE_IDS: "{not json" })).toBeNull();
    expect(paddleConfigFrom({ ...ENV, PADDLE_PRICE_IDS: JSON.stringify({ BASIC: PRICES.BASIC }) })).toBeNull();
  });
});

describe("priceLookup", () => {
  it("finds the plan, interval and trial flag of every configured price", () => {
    const lookup = priceLookup(PRICES);
    expect(lookup.get("pri_bm_t")).toEqual({ plan: "BASIC", interval: "MONTH", trial: true });
    expect(lookup.get("pri_py")).toEqual({ plan: "PRO", interval: "YEAR", trial: false });
    expect(lookup.get("pri_unknown")).toBeUndefined();
  });
});
