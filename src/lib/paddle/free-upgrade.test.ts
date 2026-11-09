import { describe, expect, it } from "vitest";

import { freeUpgradeStamp, hasValidFreeUpgradeStamp } from "./free-upgrade";

const NOW = new Date("2026-11-09T12:00:00Z");
const stamp = freeUpgradeStamp("secret", "biz_1", NOW);

describe("free-clinic upgrade stamp", () => {
  it("verifies the clinic's own stamp within a day", () => {
    expect(hasValidFreeUpgradeStamp("secret", "biz_1", { businessId: "biz_1", ...stamp }, NOW)).toBe(true);
    expect(hasValidFreeUpgradeStamp("secret", "biz_1", { ...stamp }, new Date(NOW.getTime() + 23 * 3_600_000))).toBe(true);
  });

  it("refuses another clinic's stamp, a wrong secret, a forged or missing one", () => {
    expect(hasValidFreeUpgradeStamp("secret", "biz_2", { ...stamp }, NOW)).toBe(false);
    expect(hasValidFreeUpgradeStamp("other", "biz_1", { ...stamp }, NOW)).toBe(false);
    expect(hasValidFreeUpgradeStamp("secret", "biz_1", { freeUpgradeAt: stamp.freeUpgradeAt, freeUpgradeSig: "00".repeat(32) }, NOW)).toBe(false);
    expect(hasValidFreeUpgradeStamp("secret", "biz_1", { freeUpgradeAt: stamp.freeUpgradeAt, freeUpgradeSig: "zz" }, NOW)).toBe(false);
    expect(hasValidFreeUpgradeStamp("secret", "biz_1", { businessId: "biz_1" }, NOW)).toBe(false);
    expect(hasValidFreeUpgradeStamp("secret", "biz_1", null, NOW)).toBe(false);
  });

  it("refuses a stamp older than a day, or from the future", () => {
    expect(hasValidFreeUpgradeStamp("secret", "biz_1", { ...stamp }, new Date(NOW.getTime() + 25 * 3_600_000))).toBe(false);
    expect(hasValidFreeUpgradeStamp("secret", "biz_1", { ...stamp }, new Date(NOW.getTime() - 60_000))).toBe(false);
  });
});
