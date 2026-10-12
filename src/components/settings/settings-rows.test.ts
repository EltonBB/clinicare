import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// vitest here is node-only (no React rendering), so the settled Settings row treatment is pinned at the
// source: AGENTS.md describes Working hours, Reminders and Workflows as "divided toggle rows", and
// Workflows once shipped without the dividers, so its rows ran together (Codex #130).
const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");

const DIVIDED_LIST = 'className="divide-y divide-border/65"';

describe("Settings divided rows", () => {
  it("divides the Workflows rows with the same classes Reminders and Working hours use", () => {
    const workspace = read("./settings-workspace.tsx");
    const workflows = read("./workflows-section.tsx");

    // Working hours and Reminders each wrap their rows in the divided list...
    expect(workspace.split(DIVIDED_LIST).length - 1).toBeGreaterThanOrEqual(2);
    // ...and so do the Workflows rows.
    expect(workflows).toContain(`<div ${DIVIDED_LIST}>`);
  });

  it("keeps every Workflows row inside that one divided wrapper", () => {
    const workflows = read("./workflows-section.tsx");
    const wrapper = workflows.slice(workflows.indexOf(`<div ${DIVIDED_LIST}>`));

    // Rebooking (Pro only), payment reminder, thank-you.
    expect(wrapper.match(/<ToggleRow\b/g)).toHaveLength(3);
  });
});
