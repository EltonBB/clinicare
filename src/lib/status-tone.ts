// Canonical appointment-status → color values, usable anywhere a raw CSS
// color is needed (SVG stroke/fill, inline styles) rather than a Tailwind
// class. Must match Calendar's own statusDotClasses/monthChipClasses
// (calendar-workspace.tsx) exactly — Calendar is the source of truth per
// AGENTS.md's "same tone set as everywhere else" rule, and those are
// Tailwind utility classes (bg-primary, bg-emerald-500, bg-amber-500,
// bg-destructive), which can't be imported as raw values, so the 4 values
// below are kept in sync by hand. If Calendar's classes ever change,
// update this file to match.
export const APPOINTMENT_STATUS_COLORS = {
  confirmed: "var(--primary)",
  completed: "#10b981", // Tailwind emerald-500, matches bg-emerald-500
  pending: "#f59e0b", // Tailwind amber-500, matches bg-amber-500
  cancelled: "var(--destructive)",
} as const;

export const APPOINTMENT_STATUS_FALLBACK_COLOR = "#94a3b8";
