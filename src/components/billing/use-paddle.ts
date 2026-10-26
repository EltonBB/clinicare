"use client";

import { useEffect, useState } from "react";

/**
 * Paddle.js v2, loaded once per page from Paddle's CDN (next.config.ts allows
 * it in the CSP) and initialised with the public client-side token. The env and
 * token come from the server as props, so nothing here reads secrets.
 */
export type PaddleEnv = "sandbox" | "production";

export type PaddleClientConfig = { env: PaddleEnv; clientToken: string };

type PricePreviewResult = {
  data: {
    details: {
      lineItems: Array<{ price: { id: string }; formattedTotals: { total: string } }>;
    };
  };
};

export type PaddleJs = {
  Environment: { set(env: string): void };
  Initialize(options: { token: string; eventCallback?: (event: { name?: string }) => void }): void;
  Checkout: {
    open(options: {
      items: Array<{ priceId: string; quantity: number }>;
      customer?: { email: string };
      customData?: Record<string, string>;
      settings?: { displayMode?: "overlay"; theme?: "light"; locale?: string; successUrl?: string };
    }): void;
  };
  PricePreview(request: { items: Array<{ priceId: string; quantity: number }> }): Promise<PricePreviewResult>;
};

declare global {
  interface Window {
    Paddle?: PaddleJs;
  }
}

const PADDLE_JS_SRC = "https://cdn.paddle.com/paddle/v2/paddle.js";
let loading: Promise<PaddleJs> | null = null;

function loadPaddle(config: PaddleClientConfig): Promise<PaddleJs> {
  if (loading) return loading;
  loading = new Promise<PaddleJs>((resolve, reject) => {
    const ready = () => {
      const paddle = window.Paddle;
      if (!paddle) {
        reject(new Error("Paddle.js did not load."));
        return;
      }
      if (config.env === "sandbox") paddle.Environment.set("sandbox");
      paddle.Initialize({ token: config.clientToken });
      resolve(paddle);
    };
    if (window.Paddle) {
      ready();
      return;
    }
    const script = document.createElement("script");
    script.src = PADDLE_JS_SRC;
    script.async = true;
    script.onload = ready;
    script.onerror = () => {
      loading = null;
      reject(new Error("Paddle.js did not load."));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/**
 * Paddle.js once it has loaded (null until then, or when billing is off), and
 * whether loading failed (a blocker, a network error) so callers can say so.
 */
export function usePaddle(config: PaddleClientConfig | null): { paddle: PaddleJs | null; failed: boolean } {
  const [state, setState] = useState<{ paddle: PaddleJs | null; failed: boolean }>({ paddle: null, failed: false });
  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    loadPaddle(config)
      .then((instance) => {
        if (!cancelled) setState({ paddle: instance, failed: false });
      })
      .catch(() => {
        // Prices fall back to the list prices; the checkout button says it didn't load.
        if (!cancelled) setState({ paddle: null, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [config]);
  return state;
}

/** "€39.00" → "€39": whole amounts read cleaner on a pricing card. */
export function trimWholeAmount(formatted: string): string {
  return formatted.replace(/([.,])00(?=\D*$)/, "");
}

/**
 * The visitor's local price for each price id (Paddle localises from their IP,
 * tax included), keyed by price id. Empty until Paddle answers, so callers show
 * their list price meanwhile.
 */
export function useLocalizedPrices(config: PaddleClientConfig | null, priceIds: string[]): Record<string, string> {
  const { paddle } = usePaddle(config);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const key = priceIds.join(",");
  useEffect(() => {
    if (!paddle || !key) return;
    let cancelled = false;
    paddle
      .PricePreview({ items: key.split(",").map((priceId) => ({ priceId, quantity: 1 })) })
      .then((result) => {
        if (cancelled) return;
        const next: Record<string, string> = {};
        for (const item of result.data.details.lineItems) next[item.price.id] = trimWholeAmount(item.formattedTotals.total);
        setPrices(next);
      })
      .catch(() => {
        // Keep the list prices.
      });
    return () => {
      cancelled = true;
    };
  }, [paddle, key]);
  return prices;
}
