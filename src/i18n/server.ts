import { cookies, headers } from "next/headers";
import { cache } from "react";

import { LOCALE_COOKIE, resolveLocale } from "./config";
import { messages, type Messages, type Namespace } from "./messages";

export const getLocale = cache(async () => {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  return resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value, headerList.get("accept-language"));
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
