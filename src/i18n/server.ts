import { cookies, headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { cache } from "react";

import { defaultLocale, LOCALE_COOKIE, resolveLocale, type Locale } from "./config";
import { messages, type Messages, type Namespace } from "./messages";

export const getLocale = cache(async (): Promise<Locale> => {
  try {
    const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
    return resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value, headerList.get("accept-language"));
  } catch (error) {
    // Next's own render signals (dynamic usage, prerender bailouts) pass through.
    unstable_rethrow(error);
    // Outside a request (a cron job, a test) there is no visitor to ask.
    return defaultLocale;
  }
});

/** The request's language and its full dictionary, for server components and actions. */
export const getI18n = cache(async () => {
  const locale = await getLocale();
  return { locale, m: messages[locale] };
});

/** The namespaces a client subtree needs, to hand to `MessagesProvider`. */
export function pickNamespaces<N extends Namespace>(m: Messages, names: readonly N[]) {
  return Object.fromEntries(names.map((name) => [name, m[name]])) as Pick<Messages, N>;
}
