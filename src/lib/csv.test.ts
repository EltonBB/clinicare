import { describe, expect, it } from "vitest";

import { csvCell, csvDocument } from "@/lib/csv";

describe("csvCell", () => {
  it("quotes plain text and doubles embedded quotes", () => {
    expect(csvCell("Deep cleaning")).toBe('"Deep cleaning"');
    expect(csvCell('Said "hello"')).toBe('"Said ""hello"""');
  });

  it("keeps commas and line breaks inside the quoted cell", () => {
    expect(csvCell("a, b\nc")).toBe('"a, b\nc"');
  });

  it("renders empty and missing values as an empty quoted cell", () => {
    expect(csvCell("")).toBe('""');
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
  });

  it.each([
    ["=HYPERLINK(\"http://evil.example\",\"click\")", `"'=HYPERLINK(""http://evil.example"",""click"")"`],
    ["=1+1", `"'=1+1"`],
    ["+SUM(A1:A9)", `"'+SUM(A1:A9)"`],
    ["-2+3", `"'-2+3"`],
    ["@SUM(A1)", `"'@SUM(A1)"`],
    ["\t=1+1", `"'\t=1+1"`],
    ["\r=1+1", `"'\r=1+1"`],
    ["\n=1+1", `"'\n=1+1"`],
  ])("makes a formula-looking cell inert: %j", (value, expected) => {
    expect(csvCell(value)).toBe(expected);
  });

  it("only looks at the start of the cell", () => {
    expect(csvCell("Total = 5")).toBe('"Total = 5"');
    expect(csvCell("a+b")).toBe('"a+b"');
    expect(csvCell("50% - paid")).toBe('"50% - paid"');
  });

  it("leaves app-generated values untouched when marked literal (a negative amount keeps its minus)", () => {
    expect(csvCell("-€12.50", { literal: true })).toBe('"-€12.50"');
    expect(csvCell("Sep 26, 2026", { literal: true })).toBe('"Sep 26, 2026"');
  });

  it("does not turn a literal cell's formula into an exemption for text cells", () => {
    expect(csvCell("=1+1", { literal: true })).toBe('"=1+1"');
    expect(csvCell("=1+1")).toBe(`"'=1+1"`);
  });
});

describe("csvDocument", () => {
  it("joins cells with commas and rows with newlines", () => {
    expect(csvDocument([[csvCell("a"), csvCell("b")], [csvCell("=x"), csvCell("d")]])).toBe(`"a","b"\n"'=x","d"`);
  });
});
