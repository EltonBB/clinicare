import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { serverText } from "./messages/sq/server-text";
import { translateServerText } from "./server-text";

// Action files whose messages are translated; each phase adds its own.
const COVERED = [
  "src/app/(auth)/actions.ts",
  "src/lib/business.ts",
  "src/app/onboarding/actions.ts",
  "src/lib/media-storage-client.ts",
];

// Literal sentences an action shows a person: `error:`, `success:`, `message:`
// (or assigned to such a variable), the constants they come from, `return`ed
// sentences, the branches of a multi-line `? :`, sentences alone on a line (a
// list of messages), and Zod messages like `.email("…")` or `.min(8, "…")`.
const LITERAL = /(?:\b(?:error|success|message)\s*[:=]\s*|_(?:ERROR|MESSAGE)\s*=\s*|^\s*(?:[?:]|return)?\s*|\.\w+\((?:[^()"]*,\s*)?)"((?:[^"\\]|\\.)*[a-z][^"]*[.?!])"/gm;

function literals(file: string) {
  const source = readFileSync(join(process.cwd(), file), "utf8");
  return [...source.matchAll(LITERAL)].map((match) => match[1].replace(/\\(.)/g, "$1"));
}

describe("server messages in Albanian", () => {
  it.each(COVERED)("%s: every literal message has a translation", (file) => {
    const missing = literals(file).filter((text) => translateServerText(text, "sq") === text);
    expect(missing).toEqual([]);
  });

  it.each(Object.entries(serverText))("%s keeps its placeholders", (source, target) => {
    const names = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    expect(names(target)).toEqual(names(source));
    expect(target).not.toBe(source);
  });

  it("fills placeholders and leaves unknown text and English alone", () => {
    expect(translateServerText("A password reset link was sent to maya@clinic.com.", "sq")).toBe(
      "U dërgua një lidhje për rivendosjen e fjalëkalimit te maya@clinic.com.",
    );
    expect(translateServerText("Something new.", "sq")).toBe("Something new.");
    expect(translateServerText("Enter your password.", "en")).toBe("Enter your password.");
  });
});
