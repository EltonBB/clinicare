import { describe, expect, it } from "vitest";

import { resolveLocale } from "./config";

describe("resolveLocale", () => {
  it("prefers a valid cookie over the browser's languages", () => {
    expect(resolveLocale("sq", "en-US,en;q=0.9")).toBe("sq");
    expect(resolveLocale("en", "sq-XK,sq;q=0.9")).toBe("en");
  });

  it("ignores an unknown cookie value", () => {
    expect(resolveLocale("de", "sq")).toBe("sq");
  });

  it("picks the first language Vela speaks, by quality", () => {
    expect(resolveLocale(undefined, "de-DE,sq;q=0.8,en;q=0.5")).toBe("sq");
    expect(resolveLocale(undefined, "en;q=0.4,sq-AL;q=0.9")).toBe("sq");
    expect(resolveLocale(undefined, "fr,en-GB;q=0.7")).toBe("en");
  });

  it("reads the quality parameter in any case", () => {
    expect(resolveLocale(undefined, "en;Q=0,sq;q=0.8")).toBe("sq");
  });

  it("lets * stand for the languages the header doesn't name", () => {
    expect(resolveLocale(undefined, "en;q=0,*;q=0.8")).toBe("sq");
    expect(resolveLocale(undefined, "de,*;q=0.5")).toBe("en");
    expect(resolveLocale(undefined, "sq;q=0,en;q=0,*")).toBe("en");
  });

  it("falls back to English", () => {
    expect(resolveLocale(undefined, null)).toBe("en");
    expect(resolveLocale(undefined, "de,fr")).toBe("en");
    expect(resolveLocale(undefined, "sq;q=0")).toBe("en");
  });
});
