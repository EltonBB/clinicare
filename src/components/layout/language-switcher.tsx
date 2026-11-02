"use client";

import { useState } from "react";

import { useI18n } from "@/i18n/client";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, localeNames, locales, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

function storeLocale(locale: Locale) {
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax${secure}`;
}

/**
 * EN / SQ as two separate text buttons. Choosing one stores the language in a
 * cookie and reloads the page. A full reload, not a soft refresh: pages that
 * seed local state from their first render (a client record, the calendar's
 * loaded months) would otherwise keep the old language's dates and labels.
 */
export function LanguageSwitcher({ tone = "default", className }: { tone?: "default" | "light"; className?: string }) {
  const { locale, m } = useI18n();
  const [pending, setPending] = useState(false);

  function choose(next: Locale) {
    if (next === locale || pending) return;
    storeLocale(next);
    setPending(true);
    window.location.reload();
  }

  return (
    <div role="group" aria-label={m.common.language.label} className={cn("flex items-center gap-1", className)}>
      {locales.map((option) => {
        const current = option === locale;
        return (
          <button
            key={option}
            type="button"
            lang={option}
            title={localeNames[option]}
            aria-label={localeNames[option]}
            aria-pressed={current}
            disabled={pending}
            onClick={() => choose(option)}
            className={cn(
              "inline-flex h-8 min-w-8 items-center justify-center rounded-(--radius-field) px-1.5 text-xs font-semibold tracking-wide transition-colors duration-(--duration-base) active:scale-[0.97] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/45 disabled:cursor-wait",
              tone === "light"
                ? current
                  ? "text-white"
                  : "text-white/50 hover:text-white"
                : current
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
