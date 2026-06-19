import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";

const proofTiles = [
  { label: "One workspace", sub: "Appointments to reports" },
  { label: "WhatsApp-ready", sub: "Reminders & inbox" },
  { label: "Privacy-conscious", sub: "Built compliance-first" },
];

/**
 * Shared split-screen shell for every (auth) page: a cobalt brand panel on the
 * left (desktop only) and a centered form column on the right. Pages render
 * their own form/content as children — the brand panel is shared chrome, so the
 * whole auth family stays visually consistent.
 *
 * The panel has a calm, always-on backdrop: three slow drifting glows (the same
 * keyframes the hero uses) plus a one-time staggered entrance on its content.
 * All motion is gated behind `motion-safe`, so reduced-motion users get a clean
 * static panel. Sample/positioning copy only — no live data, no claims Vela
 * can't stand behind.
 */
export function AuthSplitShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel — desktop only */}
      <aside className="relative hidden overflow-hidden bg-[linear-gradient(155deg,#0a22ff_0%,#1f4bff_48%,#4f86ff_100%)] p-10 text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:justify-between xl:p-14">
        {/* chill drifting glows — the living backdrop (like the hero) */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-24 top-6 size-[26rem] rounded-full bg-[radial-gradient(closest-side,rgba(165,200,255,0.45),transparent)] blur-3xl motion-safe:animate-[vela-aurora-float_18s_var(--ease-out-quint)_infinite]" />
          <div className="absolute -right-32 top-1/4 size-[34rem] rounded-full bg-[radial-gradient(closest-side,rgba(195,220,255,0.42),transparent)] blur-3xl motion-safe:animate-[vela-dialog-orb_24s_var(--ease-out-quint)_infinite]" />
          <div className="absolute -bottom-28 left-1/4 size-[30rem] rounded-full bg-[radial-gradient(closest-side,rgba(120,165,255,0.4),transparent)] blur-3xl [animation-delay:-10s] motion-safe:animate-[vela-aurora-float_28s_var(--ease-out-quint)_infinite]" />
        </div>
        <div aria-hidden className="vela-grid-texture pointer-events-none absolute inset-0 opacity-25" />

        {/* top — brand */}
        <div className="relative">
          <BrandMark
            href="/"
            includeSubtitle={false}
            tone="light"
            size="lg"
            className="drop-shadow-[0_2px_14px_rgba(4,10,40,0.3)] motion-safe:animate-[vela-fade-up_0.5s_var(--ease-out-expo)_both]"
          />
        </div>

        {/* middle — story */}
        <div className="relative max-w-md">
          <h2 className="text-[2.6rem] font-semibold leading-[1.04] tracking-tight drop-shadow-[0_1px_18px_rgba(4,10,40,0.18)] [animation-delay:80ms] motion-safe:animate-[vela-fade-up_0.6s_var(--ease-out-expo)_both]">
            Run the whole clinic day from one calm workspace.
          </h2>
          <p className="mt-5 max-w-sm text-[15px] leading-7 text-white/75 [animation-delay:160ms] motion-safe:animate-[vela-fade-up_0.6s_var(--ease-out-expo)_both]">
            Appointments, patients, staff, WhatsApp messages, payments, and reports — in one clean system built for
            modern clinics.
          </p>

          <div className="mt-10 grid grid-cols-3 gap-3 [animation-delay:240ms] motion-safe:animate-[vela-fade-up_0.6s_var(--ease-out-expo)_both]">
            {proofTiles.map((tile) => (
              <div
                key={tile.label}
                className="rounded-(--radius-field) border border-white/15 bg-white/10 p-3.5 backdrop-blur transition-[transform,background-color,border-color] duration-(--duration-base) ease-out-quint hover:-translate-y-0.5 hover:border-white/30 hover:bg-white/15"
              >
                <p className="text-sm font-bold text-white">{tile.label}</p>
                <p className="mt-1 text-[11px] font-semibold leading-4 text-white/60">{tile.sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* bottom — trust line */}
        <div className="relative flex items-center gap-2 text-xs font-semibold text-white/60 [animation-delay:320ms] motion-safe:animate-[vela-fade-up_0.6s_var(--ease-out-expo)_both]">
          <ShieldCheck className="size-4 text-white/50" />
          Privacy-conscious by design · HIPAA-ready engineering
        </div>
      </aside>

      {/* Form column */}
      <main className="flex min-h-screen flex-col items-center justify-center bg-white px-4 py-10 sm:px-6">
        <div className="w-full max-w-[420px]">{children}</div>
      </main>
    </div>
  );
}
