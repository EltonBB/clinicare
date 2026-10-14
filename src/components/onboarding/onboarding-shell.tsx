import type { ReactNode } from "react";

import { LogoutButton } from "@/components/auth/logout-button";
import { BrandMark } from "@/components/brand-mark";

/**
 * Onboarding's split layout, the same family as the auth pages
 * (AuthSplitShell): the form column on the left, an ink panel on the right.
 * Here the panel shows the visitor's own clinic taking shape instead of the
 * module orbit. Used by the setup flow and the "ready" page.
 */
export function OnboardingShell({
  children,
  panel,
  panelLead,
  panelTail,
}: {
  children: ReactNode;
  panel: ReactNode;
  panelLead: string;
  panelTail: string;
}) {
  return (
    <div className="grid min-h-dvh bg-white lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <main className="flex min-h-dvh min-w-0 flex-col px-4 py-6 sm:px-10 sm:py-8">
        <div className="flex items-center justify-between">
          {/* No Business row exists until onboarding completes, so prefetching
              /dashboard here could cache a redirect-to-onboarding response
              that outlives the moment bootstrap actually creates it. */}
          <BrandMark href="/dashboard" includeSubtitle={false} prefetch={false} />
          <LogoutButton className="h-9 px-2.5 text-muted-foreground hover:bg-transparent hover:text-[var(--brand-ink)] [&_svg]:size-3.5" />
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[440px]">{children}</div>
        </div>
      </main>

      <aside className="relative hidden overflow-hidden bg-[var(--brand-ink)] text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
        {/* Scrolls inside the panel on short screens instead of clipping. */}
        <div className="flex min-h-0 flex-1 overflow-y-auto px-10 pt-8 xl:px-14">
          <div className="m-auto flex w-full justify-center">{panel}</div>
        </div>
        <div className="px-10 pb-10 pt-6 xl:px-14 xl:pb-14">
          <p
            key={panelLead}
            className="max-w-lg text-[2rem] font-semibold leading-[1.08] tracking-[-0.025em] motion-safe:animate-[vela-fade-up_0.5s_var(--ease-out-expo)_both]"
          >
            {panelLead} <span className="text-white/45">{panelTail}</span>
          </p>
        </div>
      </aside>
    </div>
  );
}
