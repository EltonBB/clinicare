import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { getI18n } from "@/i18n/server";
import { ModuleOrbit } from "./module-orbit";

/**
 * Shared shell for every (auth) page. The form column sits on the left with
 * the brand and a way back to the site; on wide screens an ink panel on the
 * right shows the product's one idea, the six modules orbiting one centre
 * (readable by pointing), above the promise and three plain facts. Pages render only their own heading and
 * form as children, so the whole auth family stays consistent.
 */
export async function AuthSplitShell({ children }: { children: ReactNode }) {
  const t = (await getI18n()).m.auth.shell;
  const year = new Date().getFullYear();

  return (
    <div className="grid min-h-dvh bg-white lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <main className="flex min-h-dvh flex-col px-5 py-6 sm:px-10 sm:py-8">
        <div className="flex items-center justify-between">
          <BrandMark href="/" />
          <Link
            href="/"
            className="group/back inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors duration-(--duration-base) hover:text-[var(--brand-ink)]"
          >
            <ArrowLeft className="size-4 transition-transform duration-(--duration-base) ease-out-quint group-hover/back:-translate-x-0.5" />
            {t.backToSite}
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-[400px] motion-safe:animate-[vela-fade-up_0.5s_var(--ease-out-expo)_both]">{children}</div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <p>© {year} Vela</p>
          <div className="flex items-center gap-5">
            <LanguageSwitcher />
            <Link href="/terms-and-conditions" className="transition-colors hover:text-[var(--brand-ink)]">
              {t.terms}
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-[var(--brand-ink)]">
              {t.privacy}
            </Link>
          </div>
        </div>
      </main>

      <aside className="relative hidden overflow-hidden bg-[var(--brand-ink)] text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:justify-end">
        {/* A size container, so the orbit can size itself to the room actually
            left above the promise: on a short laptop screen its old 52vh cap
            was taller than that, and the panel cut its top off. */}
        <div className="relative flex min-h-0 flex-1 items-center justify-center px-10 pt-12 [container-type:size] xl:px-14">
          <ModuleOrbit />
        </div>

        <div className="relative px-10 pb-10 pt-8 xl:px-14 xl:pb-14">
          <p className="max-w-md text-[2rem] font-semibold leading-[1.08] tracking-[-0.025em]">
            {t.promiseLead} <span className="text-white/45">{t.promiseRest}</span>
          </p>
          <dl className="mt-8 max-w-md divide-y divide-white/10 border-y border-white/10 text-sm">
            {t.facts.map(([label, value]) => (
              <div key={label} className="flex items-baseline gap-6 py-3.5">
                <dt className="w-20 shrink-0 text-white/45">{label}</dt>
                <dd className="text-white/85">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </aside>
    </div>
  );
}
