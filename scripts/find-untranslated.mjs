// Lists visible English that bypasses the i18n dictionaries: JSX text and
// literal string props a person reads (aria-label, title, placeholder, alt, label).
// A heuristic for the translation sweep, not a gate: it can flag code-like text.
//
//   node scripts/find-untranslated.mjs src/components/marketing src/app/page.tsx
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = process.argv.slice(2);
if (roots.length === 0) {
  console.error("usage: node scripts/find-untranslated.mjs <dir|file>...");
  process.exit(1);
}

function files(path) {
  if (statSync(path).isFile()) return /\.tsx$/.test(path) && !/\.test\./.test(path) ? [path] : [];
  return readdirSync(path).flatMap((name) => files(join(path, name)));
}

const WORDS = /[A-Za-z]{2,}.*[A-Za-z]/;
const JSX_TEXT = />([^<>{}]*[A-Za-z]{2,}[^<>{}]*)</g;
const PROP = /\b(aria-label|title|placeholder|alt|label|description|heading|lead|tail)="([^"]*[A-Za-z]{2,}[^"]*)"/g;

let total = 0;
for (const file of roots.flatMap(files)) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("import ")) return;
    const hits = [];
    for (const match of line.matchAll(JSX_TEXT)) {
      const text = match[1].trim();
      if (WORDS.test(text) && !/^[\w.]+\s*(=>|\(|&&|\?)/.test(text)) hits.push(text);
    }
    for (const match of line.matchAll(PROP)) hits.push(`${match[1]}="${match[2]}"`);
    // A line that is only text inside JSX (multi-line children).
    if (!hits.length && /^[A-Z][^=;{}()<>]*[a-z][^=;{}()<>]*$/.test(trimmed) && !/^[A-Z_]+$/.test(trimmed)) hits.push(trimmed);
    for (const hit of hits) {
      total += 1;
      console.log(`${file}:${index + 1}  ${hit.slice(0, 100)}`);
    }
  });
}
console.log(`\n${total} candidate string(s).`);
