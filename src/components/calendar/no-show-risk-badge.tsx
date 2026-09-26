import { cn } from "@/lib/utils";
import type { NoShowRiskAssessment } from "@/lib/no-show-risk";

const LEVEL_STYLES = {
  medium: "border border-amber-400 bg-white text-amber-700",
  high: "border border-red-400 bg-white text-red-700",
} as const;

const LEVEL_LABELS = {
  medium: "Medium risk",
  high: "High risk",
} as const;

/**
 * Only Medium/High render — a "Low risk" pill on most appointments would be
 * pure noise (AGENTS.md's anti-clutter rules). The top reason is the title
 * (hover), never printed inline, to keep the pill compact everywhere it's used.
 */
export function NoShowRiskBadge({ risk }: { risk: NoShowRiskAssessment | null | undefined }) {
  if (!risk || risk.insufficientHistory || risk.level === "low") {
    return null;
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[11px] font-medium",
        LEVEL_STYLES[risk.level]
      )}
      title={risk.reasons[0] ?? undefined}
    >
      {LEVEL_LABELS[risk.level]}
    </span>
  );
}
