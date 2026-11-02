"use client";

import { createContext, useCallback, useContext, useMemo } from "react";

import type { Locale } from "./config";
import type { Messages } from "./messages";
import { translateServerText } from "./server-text";

type I18nValue = { locale: Locale; m: Partial<Messages> };

const I18nContext = createContext<I18nValue | null>(null);

/**
 * Hands dictionary namespaces to client components. Nested providers add their
 * namespaces to the parent's, so each surface ships only what it renders.
 */
export function MessagesProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Partial<Messages>;
  children: React.ReactNode;
}) {
  const parent = useContext(I18nContext);
  const value = useMemo(
    () => ({ locale, m: { ...parent?.m, ...messages } }),
    [locale, parent, messages],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * The current language and dictionary. Only the namespaces a provider above
 * supplied are present at runtime; reading another one is a bug.
 */
export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside MessagesProvider.");
  return value as { locale: Locale; m: Messages };
}

/** Shows a server action's message (`error`, `success`, a field error) in the current language. */
export function useServerText() {
  const { locale } = useI18n();
  return useCallback((text: string | undefined) => (text ? translateServerText(text, locale) : text), [locale]);
}
