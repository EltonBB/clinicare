import { describe, expect, it } from "vitest";

import { fmt, plural } from "./format";

describe("fmt", () => {
  it("fills placeholders and leaves unknown ones", () => {
    expect(fmt("Hi {name}, {count} new", { name: "Maya", count: 3 })).toBe("Hi Maya, 3 new");
    expect(fmt("Hi {name}", {})).toBe("Hi {name}");
  });
});

describe("plural", () => {
  const forms = { one: "{count} termin", other: "{count} termine" };

  it("uses Albanian plural rules", () => {
    expect(plural(forms, 1, "sq")).toBe("1 termin");
    expect(plural(forms, 0, "sq")).toBe("0 termine");
    expect(plural(forms, 5, "sq")).toBe("5 termine");
  });

  it("formats the count for the language", () => {
    expect(plural({ one: "{count} visit", other: "{count} visits" }, 12000, "en")).toBe("12,000 visits");
  });
});
