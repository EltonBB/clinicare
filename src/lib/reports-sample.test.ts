import { describe, expect, it } from "vitest";

import { buildSampleReportsView, getSampleReportsView } from "./reports-sample";

const NOW = new Date("2026-10-14T10:00:00Z");

describe("buildSampleReportsView", () => {
  it("is deterministic for the same moment", () => {
    expect(JSON.stringify(buildSampleReportsView(NOW, "Europe/Belgrade"))).toBe(
      JSON.stringify(buildSampleReportsView(NOW, "Europe/Belgrade"))
    );
  });

  it("fills every section the Pro page shows", () => {
    const view = buildSampleReportsView(NOW, "Europe/Belgrade");
    const period = view.periods[view.defaultPeriod];

    const value = (label: string) => period.metrics.find((metric) => metric.label === label)?.value;
    for (const label of ["Appointments", "Completion rate", "New clients", "Estimated utilization"]) {
      expect(value(label), label).toBeTruthy();
      expect(value(label), label).not.toMatch(/^0(\.0)?%?$/);
    }
    expect(period.chart.points.some((point) => point.value > 0)).toBe(true);
    expect(period.diagnostics.staffLoad.length).toBe(4);
  });

  it("never labels its numbers as AI output (no snapshots are passed)", () => {
    const view = buildSampleReportsView(NOW, "Europe/Belgrade");
    expect(view.periods[view.defaultPeriod].snapshot.source).toBe("rules");
  });

  it("reuses one build within the hour and rebuilds after it", () => {
    const first = getSampleReportsView(NOW, "Europe/Belgrade");
    expect(getSampleReportsView(new Date(NOW.getTime() + 20 * 60_000), "Europe/Belgrade")).toBe(first);
    expect(getSampleReportsView(new Date(NOW.getTime() + 61 * 60_000), "Europe/Belgrade")).not.toBe(first);
  });
});
