import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

import { Magnetic } from "../motion/magnetic";

/** The marketing primary action: solid ink, magnetic, press feedback. */
export function PrimaryCta({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Magnetic>
      <Link
        href={href}
        className="inline-flex h-12 min-w-32 items-center justify-center gap-2 whitespace-nowrap rounded-(--radius-mkt-field) bg-[var(--brand-ink)] px-6 text-sm font-semibold text-white transition-transform duration-(--duration-base) ease-out-quint hover:-translate-y-0.5 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/45"
      >
        {children}
        <ArrowRight className="size-4" />
      </Link>
    </Magnetic>
  );
}

/** The quieter companion action: hairline outline, tints cobalt on hover. */
export function SecondaryCta({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex h-12 min-w-32 items-center justify-center whitespace-nowrap rounded-(--radius-mkt-field) border border-border/70 bg-white/70 px-6 text-sm font-semibold text-foreground backdrop-blur-sm transition-[color,border-color,transform] duration-(--duration-base) ease-out-quint hover:border-primary/30 hover:text-primary active:scale-[0.97]"
    >
      {children}
    </Link>
  );
}
