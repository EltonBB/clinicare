import type { Locale } from "./config";
import { serverText as sq } from "./messages/sq/server-text";

/*
 * Messages that server actions return (`error`, `success`, field errors) stay
 * in English on the server, where they are also what tests assert. Screens
 * translate them as they show them: an exact English sentence is looked up,
 * and a sentence with a `{placeholder}` matches any value there, which is
 * carried into the translation. Anything unknown shows as it came.
 */

const tables: Partial<Record<Locale, Record<string, string>>> = { sq };

type Pattern = { regex: RegExp; names: string[]; template: string };
const patterns = new Map<Locale, Pattern[]>();

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compile(locale: Locale): Pattern[] {
  const cached = patterns.get(locale);
  if (cached) return cached;
  const compiled = Object.entries(tables[locale] ?? {})
    .filter(([source]) => /\{\w+\}/.test(source))
    .map(([source, template]) => {
      const names: string[] = [];
      const body = source
        .split(/(\{\w+\})/)
        .map((part) => {
          const name = /^\{(\w+)\}$/.exec(part)?.[1];
          if (!name) return escape(part);
          names.push(name);
          return "(.+?)";
        })
        .join("");
      return { regex: new RegExp(`^${body}$`), names, template };
    });
  patterns.set(locale, compiled);
  return compiled;
}

export function translateServerText(text: string, locale: Locale): string {
  const table = tables[locale];
  if (!table) return text;
  const exact = table[text];
  if (exact) return exact;
  for (const { regex, names, template } of compile(locale)) {
    const match = regex.exec(text);
    if (match) return names.reduce((out, name, i) => out.replaceAll(`{${name}}`, match[i + 1]), template);
  }
  return text;
}
