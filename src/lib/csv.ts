// A cell that starts with one of these is read as a formula by Excel, Numbers and
// Sheets (OWASP "CSV injection"): =HYPERLINK(...) or =cmd|... in a description
// would run when someone opens a statement. Tab, carriage return and line feed
// are on the list because some spreadsheets skip them before deciding — a
// quoted cell keeps an embedded LF as real data, but that doesn't stop an
// import path from treating a *leading* one as ignorable whitespace ahead of
// the "=" (CodeRabbit/Codex).
const FORMULA_START = /^[=+\-@\t\r\n]/;

/**
 * One quoted CSV cell. Text entered by a person (descriptions, invoice and
 * receipt numbers, payment methods) is made inert with a leading apostrophe —
 * spreadsheets show it as plain text and hide the apostrophe. Pass
 * `{ literal: true }` for values the app generated itself (dates, formatted
 * amounts) so a legitimate leading "-" on a negative amount is kept as is.
 */
export function csvCell(value: unknown, options: { literal?: boolean } = {}): string {
  let text = String(value ?? "");

  if (!options.literal && FORMULA_START.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replaceAll('"', '""')}"`;
}

/** Rows of already-built cells joined into a CSV document. */
export function csvDocument(rows: string[][]): string {
  return rows.map((row) => row.join(",")).join("\n");
}
