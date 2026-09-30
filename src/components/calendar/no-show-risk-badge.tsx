import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { NoShowRiskAssessment } from "@/lib/no-show-risk";

const LEVEL_STYLES = {
  medium: "bg-amber-50 text-amber-700",
  high: "bg-red-50 text-red-700",
} as const;

const LEVEL_LABELS = {
  medium: "Medium risk",
  high: "High risk",
} as const;

type QualifyingRisk = NoShowRiskAssessment & { level: "medium" | "high" };

/** setTimeout's delay is a signed 32-bit int — its largest representable value. */
const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * The qualifying (Medium/High, sufficient-history) risk assessment to show
 * right now, or null — already both filtered and narrowed, so a caller never
 * re-derives the same checks. Exported so a caller that wraps the badge in
 * its own label (the calendar quick-view popover's "Risk" row) can gate that
 * wrapper off the same value instead of re-deriving it — two independent
 * decisions drifting apart is exactly the stale-badge bug class this hook
 * exists to close (Codex #129).
 *
 * `expiresAtIso`, once past, hides the result via a scheduled timer (chained
 * across setTimeout's ~24.8-day max delay for a far-out appointment) so it
 * doesn't outlive the visit if the page is left open without a reload.
 * Starts visible-only-once-confirmed (not "visible until proven expired"):
 * reading the clock during render would make the server render and the
 * client's first paint disagree whenever an appointment's start falls in the
 * gap between the two, and a post-mount effect corrects it once — the same
 * pattern already used for the Next-up countdown in dashboard-overview.tsx.
 * Omit `expiresAtIso` for a caller with no live-staleness concern.
 */
export function useShowNoShowRisk(
  risk: NoShowRiskAssessment | null | undefined,
  expiresAtIso?: string | null
): QualifyingRisk | null {
  const [visible, setVisible] = useState(!expiresAtIso);

  useEffect(() => {
    if (!expiresAtIso) return;

    const expiresAtMs = new Date(expiresAtIso).getTime();
    let timeout: ReturnType<typeof setTimeout> | undefined;

    // setTimeout's delay is a signed 32-bit int (~24.8 days max) — a booking
    // can sit further out than that (the risk model's own 30-day lead-time
    // signal expects it), and a longer delay overflows and fires early, with
    // nothing left to re-check afterward. sync() re-derives `visible` fresh
    // each call (so an early/overflowed fire is harmless) and, while there's
    // still time left, re-arms itself for the remainder, capped — chaining
    // capped waits until the real expiry is reached (Codex/CodeRabbit #129).
    // Named rather than a bare setState in the effect body, matching the
    // compute()/setInterval shape dashboard-overview.tsx's NextUpCountdown
    // already uses (react-hooks/set-state-in-effect).
    const sync = () => {
      const msRemaining = expiresAtMs - Date.now();
      setVisible(msRemaining > 0);
      if (msRemaining > 0) {
        timeout = setTimeout(sync, Math.min(msRemaining, MAX_TIMEOUT_MS));
      }
    };

    sync();

    return () => clearTimeout(timeout);
  }, [expiresAtIso]);

  if (!risk || risk.insufficientHistory || risk.level === "low" || !visible) {
    return null;
  }

  // The checks above already exclude "low" — TS doesn't narrow a property
  // through a compound `||` guard, so this restates that as a type-level fact.
  return risk as QualifyingRisk;
}

/**
 * Only Medium/High render — a "Low risk" pill on most appointments would be
 * pure noise (AGENTS.md's anti-clutter rules). The top reason is the title
 * (hover), never printed inline, to keep the pill compact everywhere it's used.
 */
export function NoShowRiskBadge({
  risk,
  expiresAtIso,
}: {
  risk: NoShowRiskAssessment | null | undefined;
  expiresAtIso?: string | null;
}) {
  const qualifyingRisk = useShowNoShowRisk(risk, expiresAtIso);

  if (!qualifyingRisk) {
    return null;
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[11px] font-medium",
        LEVEL_STYLES[qualifyingRisk.level]
      )}
      title={qualifyingRisk.reasons[0] ?? undefined}
    >
      {LEVEL_LABELS[qualifyingRisk.level]}
    </span>
  );
}
