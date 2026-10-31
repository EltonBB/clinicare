import { describe, expect, it } from "vitest";

import { messages } from "./messages";

// Values that are the same in both languages on purpose.
const SAME_IN_BOTH = new Set([
  "Vela",
  "Vela Staff",
  "Basic",
  "Pro",
  "WhatsApp",
  "Email",
  "OK",
  "AI",
  "Paddle",
  "EUR",
  // Sample staff names on the website.
  "Dr. Collins",
  "Dr. Shaw",
]);

type Leaf = { path: string; value: string };

function leaves(node: unknown, path = ""): Leaf[] {
  if (typeof node === "string") return [{ path, value: node }];
  return Object.entries(node as Record<string, unknown>).flatMap(([key, child]) =>
    leaves(child, path ? `${path}.${key}` : key),
  );
}

function placeholders(text: string) {
  return [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

const english = new Map(leaves(messages.en).map((leaf) => [leaf.path, leaf.value]));
const albanian = leaves(messages.sq);

describe("Albanian dictionary", () => {
  it("has exactly the English keys", () => {
    expect(albanian.map((leaf) => leaf.path).sort()).toEqual([...english.keys()].sort());
  });

  it.each(albanian)("$path keeps the English placeholders", ({ path, value }) => {
    expect(placeholders(value)).toEqual(placeholders(english.get(path) ?? ""));
  });

  it.each(albanian)("$path is translated", ({ path, value }) => {
    expect(value.trim()).not.toBe("");
    const source = english.get(path) ?? "";
    // Identical text must be a known shared word, or carry no words once placeholders are removed.
    if (value === source) expect(SAME_IN_BOTH.has(value) || !/[a-z]{3}/i.test(value.replace(/\{\w+\}/g, ""))).toBe(true);
  });
});
