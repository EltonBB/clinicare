"use client";

import Link from "next/link";
import Image from "next/image";
 
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";

type BrandMarkProps = {
  compact?: boolean;
  href?: string;
  className?: string;
  size?: "default" | "lg";
  tone?: "default" | "light";
  /** Passed through to next/link — leave unset for Next's default behavior.
   *  Set false where the target route can depend on data that doesn't exist
   *  yet at render time (e.g. onboarding linking to /dashboard before the
   *  workspace is created), so a stale prefetched response can't be served. */
  prefetch?: boolean;
};

export function BrandMark({
  compact = false,
  href = "/dashboard",
  className,
  size = "default",
  tone = "default",
  prefetch,
}: BrandMarkProps) {
  const { m } = useI18n();
  const isLg = size === "lg";
  const isLight = tone === "light";

  return (
    <Link
      href={href}
      prefetch={prefetch}
      className={cn(
        "inline-flex items-center gap-2.5 rounded-[0.55rem] text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
        className
      )}
      aria-label={m.common.velaHome}
    >
      <span
        className={cn(
          isLg
            ? "inline-flex size-11 shrink-0 items-center justify-center"
            : "vela-brand-icon-tile"
        )}
      >
        <Image
          src="/brand/vela-icon.svg"
          alt=""
          width={isLg ? 44 : 30}
          height={isLg ? 44 : 30}
          className={cn("object-contain", isLight && "brightness-0 invert")}
          aria-hidden="true"
        />
      </span>
      {!compact ? (
        <span
          className={cn(
            "font-semibold leading-none tracking-tight",
            isLight ? "text-white" : "text-[var(--brand-ink)]",
            isLg ? "text-2xl" : "text-xl"
          )}
        >
          Vela
        </span>
      ) : null}
    </Link>
  );
}
