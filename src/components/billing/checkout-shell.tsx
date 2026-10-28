import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, LockKeyhole } from "lucide-react";

import { LogoutButton } from "@/components/auth/logout-button";
import { BrandMark } from "@/components/brand-mark";

/**
 * Checkout's split layout, the same family as the auth and onboarding pages:
 * the plan and payment column on the left, an ink panel on the right with the
 * order, closed by the panel's lead line. Rendered from the server page and
 * from the client checkout alike, so it stays plain markup.
 */
export function CheckoutShell({
  children,
  panel,
  panelLead,
  panelTail,
  signedIn,
}: {
  children: ReactNode;
  panel: ReactNode;
  panelLead: string;
  panelTail: string;
  signedIn: boolean;
}) {
  return (
    <div className="grid min-h-dvh bg-white lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <main className="flex min-h-dvh min-w-0 flex-col px-4 py-6 sm:px-10 sm:py-8">
        <div className="flex items-center justify-between">
          <BrandMark href={signedIn ? "/dashboard" : "/"} includeSubtitle={false} prefetch={false} />
          {signedIn ? (
            <LogoutButton className="h-9 px-2.5 text-muted-foreground hover:bg-transparent hover:text-[var(--brand-ink)] [&_svg]:size-3.5" />
          ) : (
            <Link
              href="/pricing"
              className="group/back inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors duration-(--duration-base) hover:text-[var(--brand-ink)]"
            >
              <ArrowLeft className="size-4 transition-transform duration-(--duration-base) ease-out-quint group-hover/back:-translate-x-0.5" />
              Back to pricing
            </Link>
          )}
        </div>

        <div className="flex flex-1 justify-center py-10 lg:items-center">
          <div className="w-full max-w-[460px] motion-safe:animate-[vela-fade-up_0.5s_var(--ease-out-expo)_both]">
            {children}
          </div>
        </div>

        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <LockKeyhole className="size-3.5 shrink-0" aria-hidden />
          Prices include VAT. Payment is handled securely by Paddle, our reseller.
          <Link href="/refund" className="font-medium text-[var(--brand-ink)] underline-offset-4 hover:underline">
            Refunds
          </Link>
        </p>
      </main>

      <aside className="relative overflow-hidden bg-[var(--brand-ink)] text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
        <div className="flex min-h-0 flex-1 overflow-y-auto px-5 py-10 sm:px-10 lg:pb-0 lg:pt-8 xl:px-14">
          <div className="m-auto w-full max-w-sm">{panel}</div>
        </div>
        <div className="hidden px-10 pb-10 pt-6 lg:block xl:px-14 xl:pb-14">
          <p className="max-w-lg text-[2rem] font-semibold leading-[1.08] tracking-[-0.025em]">
            {panelLead} <span className="text-white/45">{panelTail}</span>
          </p>
        </div>
      </aside>
    </div>
  );
}
