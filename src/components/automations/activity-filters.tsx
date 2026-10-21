"use client";

import { useRouter } from "next/navigation";

import { FilterChip } from "@/components/workspace/workspace-layout";
import type { AutomationKind } from "@/lib/automations";

/** URL-backed filter chips (?kind=) with each automation's send count. */
export function ActivityFilters({
  chips,
  active,
  total,
}: {
  chips: Array<{ kind: AutomationKind; label: string; count: number }>;
  active: AutomationKind | null;
  total: number;
}) {
  const router = useRouter();
  const go = (kind: AutomationKind | null) => router.push(kind ? `/automations/activity?kind=${kind}` : "/automations/activity");

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <FilterChip active={active === null} count={total} onClick={() => go(null)}>
        All
      </FilterChip>
      {chips.map((chip) => (
        <FilterChip key={chip.kind} active={active === chip.kind} count={chip.count} onClick={() => go(chip.kind)}>
          {chip.label}
        </FilterChip>
      ))}
    </div>
  );
}
