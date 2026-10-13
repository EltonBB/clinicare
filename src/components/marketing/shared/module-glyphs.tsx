/*
 * Small drawn glyphs for the six modules (used on Home and Product, always
 * this one component): line art on a 40px grid, stroked in
 * currentColor, with one accent shape that fills cobalt when the module is the
 * active one. Drawn for Vela rather than taken from an icon set.
 */

import { cn } from "@/lib/utils";

type GlyphProps = { active: boolean; className?: string };

const base = "size-10 shrink-0 transition-colors duration-(--duration-slow)";
const accent = (active: boolean) => ({
  className: "transition-[fill,opacity] duration-(--duration-slow)",
  fill: active ? "var(--primary)" : "currentColor",
  opacity: active ? 1 : 0.18,
});

function Calendar({ active, className }: GlyphProps) {
  return (
    <svg viewBox="0 0 40 40" className={cn(base, className)} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <rect x="5" y="8" width="30" height="26" rx="3" />
      <path d="M5 15h30M13 5v6M27 5v6" />
      <rect x="10" y="19" width="6" height="5" rx="1" />
      <rect x="24" y="26" width="6" height="5" rx="1" />
      <rect x="17" y="19" width="6" height="5" rx="1" stroke="none" {...accent(active)} />
    </svg>
  );
}

function Patients({ active, className }: GlyphProps) {
  return (
    <svg viewBox="0 0 40 40" className={cn(base, className)} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <rect x="6" y="6" width="28" height="28" rx="3" />
      <rect x="11" y="11" width="8" height="8" rx="1.5" stroke="none" {...accent(active)} />
      <path d="M23 13h6M23 17h4M11 24h18M11 29h12" />
    </svg>
  );
}

function Staff({ active, className }: GlyphProps) {
  return (
    <svg viewBox="0 0 40 40" className={cn(base, className)} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M5 34h30" />
      <rect x="7" y="9" width="16" height="5" rx="2.5" />
      <rect x="13" y="18" width="20" height="5" rx="2.5" stroke="none" {...accent(active)} />
      <rect x="9" y="27" width="12" height="5" rx="2.5" />
      <path d="M27 6v8" strokeDasharray="2 2" />
    </svg>
  );
}

function Inbox({ active, className }: GlyphProps) {
  return (
    <svg viewBox="0 0 40 40" className={cn(base, className)} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M6 9a3 3 0 0 1 3-3h16a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H13l-5 4v-4.5A3 3 0 0 1 6 17V9Z" />
      <path d="M15 22h16a3 3 0 0 1 3 3v8l-4-3H18a3 3 0 0 1-3-3v-5Z" stroke="none" {...accent(active)} />
    </svg>
  );
}

function Payments({ active, className }: GlyphProps) {
  return (
    <svg viewBox="0 0 40 40" className={cn(base, className)} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M9 5h22v30l-3.7-2.5L23.7 35 20 32.5 16.3 35l-3.6-2.5L9 35V5Z" />
      <path d="M14 12h12M14 17h8" />
      <circle cx="20" cy="25" r="4" stroke="none" {...accent(active)} />
    </svg>
  );
}

function Reports({ active, className }: GlyphProps) {
  return (
    <svg viewBox="0 0 40 40" className={cn(base, className)} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M6 6v28h28" />
      <path d="M11 27l7-8 5 4 9-11" />
      <circle cx="32" cy="12" r="3" stroke="none" {...accent(active)} />
    </svg>
  );
}

export const MODULE_GLYPHS = [Calendar, Patients, Staff, Inbox, Payments, Reports];
