import { describe, expect, it } from "vitest";

import { readKpiNumber } from "./kpi-value";

describe("readKpiNumber", () => {
  it("reads English numbers", () => {
    expect(readKpiNumber("€1,234.50", "en")).toEqual({ prefix: "€", target: 1234.5, decimals: 2, suffix: "" });
    expect(readKpiNumber("86.4%", "en")).toEqual({ prefix: "", target: 86.4, decimals: 1, suffix: "%" });
    expect(readKpiNumber("-12", "en")).toMatchObject({ target: -12 });
  });

  it("reads Albanian numbers: space-grouped with a decimal comma", () => {
    expect(readKpiNumber("12 345 €", "sq")).toEqual({ prefix: "", target: 12345, decimals: 0, suffix: " €" });
    expect(readKpiNumber("86,4%", "sq")).toEqual({ prefix: "", target: 86.4, decimals: 1, suffix: "%" });
    expect(readKpiNumber("1234 €", "sq")).toMatchObject({ target: 1234, suffix: " €" });
  });

  it("leaves text without a number alone", () => {
    expect(readKpiNumber("—", "sq")).toBeNull();
  });
});
