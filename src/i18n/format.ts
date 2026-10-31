import { intlLocale, type Locale } from "./config";

export type PluralForms = { one: string; other: string };

/** Fills `{name}` placeholders; a placeholder without a value is left as is. */
export function fmt(text: string, values: Record<string, string | number>) {
  return text.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

/** Picks the plural form for `count` and fills `{count}` plus any other values. */
export function plural(
  forms: PluralForms,
  count: number,
  locale: Locale,
  values: Record<string, string | number> = {},
) {
  const category = new Intl.PluralRules(intlLocale(locale)).select(count);
  return fmt(category === "one" ? forms.one : forms.other, {
    count: new Intl.NumberFormat(intlLocale(locale)).format(count),
    ...values,
  });
}
