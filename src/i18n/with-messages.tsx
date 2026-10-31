import { MessagesProvider } from "./client";
import type { Namespace } from "./messages";
import { getI18n, pickNamespaces } from "./server";

/** Server wrapper that hands the request's dictionary namespaces to client components below. */
export async function WithMessages({
  namespaces,
  children,
}: {
  namespaces: readonly Namespace[];
  children: React.ReactNode;
}) {
  const { locale, m } = await getI18n();
  return (
    <MessagesProvider locale={locale} messages={pickNamespaces(m, namespaces)}>
      {children}
    </MessagesProvider>
  );
}
