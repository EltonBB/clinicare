import { describe, expect, it } from "vitest";

import { appointmentStatusKey } from "@/lib/appointment-status";

describe("appointmentStatusKey", () => {
  it("lowercases plain statuses and hyphenates NO_SHOW", () => {
    expect(appointmentStatusKey("CONFIRMED")).toBe("confirmed");
    expect(appointmentStatusKey("COMPLETED")).toBe("completed");
    expect(appointmentStatusKey("NO_SHOW")).toBe("no-show");
  });
});
