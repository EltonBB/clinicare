import { useI18n } from "@/i18n/client";

/** The six modules: Calendar, Patients, Staff, Inbox, Documents & payments, Reports. */
export const MODULE_COUNT = 6;

/** The modules' copy in the visitor's language (`modules`). */
export function useModules() {
  return useI18n().m.modules;
}

const EVENT = "vela:select-module";

/** Ask the module explorer to open module `index` (the hero rail's tiles). */
export function selectModule(index: number) {
  window.dispatchEvent(new CustomEvent<number>(EVENT, { detail: index }));
}

/** Subscribe to `selectModule` calls; returns the unsubscribe function. */
export function onSelectModule(handler: (index: number) => void) {
  const listener = (e: Event) => handler((e as CustomEvent<number>).detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
