export const locales = ["en", "sq"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

// Read on every request (pages render per request for the CSP nonce), so the
// language never needs a URL prefix. Set by the language switcher.
export const LOCALE_COOKIE = "vela_locale";

export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

// The language's own name, shown in the switcher whatever the current language.
export const localeNames: Record<Locale, string> = {
  en: "English",
  sq: "Shqip",
};

/**
 * The language for a request: a valid cookie wins, then the first language in
 * Accept-Language that Vela speaks, then English.
 */
export function resolveLocale(cookieValue: string | undefined, acceptLanguage: string | null): Locale {
  if (isLocale(cookieValue)) return cookieValue;

  const ranges = (acceptLanguage ?? "")
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim().toLowerCase()).find((p) => p.startsWith("q="));
      return { language: tag.trim().toLowerCase().split("-")[0], q: q ? Number(q.slice(2)) : 1 };
    })
    .filter((entry) => entry.language && Number.isFinite(entry.q));
  // "*" stands for every language the header doesn't name (RFC 4647 §3.3.1).
  const named = new Set(ranges.map((entry) => entry.language));
  const preferred = ranges
    .flatMap((entry) =>
      entry.language === "*" ? locales.filter((l) => !named.has(l)).map((language) => ({ language, q: entry.q })) : [entry],
    )
    .filter((entry) => entry.q > 0)
    .sort((a, b) => b.q - a.q);

  return preferred.map((entry) => entry.language).find(isLocale) ?? defaultLocale;
}
