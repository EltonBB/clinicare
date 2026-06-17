import Link from "next/link";
import Image from "next/image";
 
import { cn } from "@/lib/utils";

type BrandMarkProps = {
  compact?: boolean;
  href?: string;
  className?: string;
  includeSubtitle?: boolean;
  size?: "default" | "lg";
};

export function BrandMark({
  compact = false,
  href = "/dashboard",
  className,
  includeSubtitle = true,
  size = "default",
}: BrandMarkProps) {
  const isLg = size === "lg";

  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2.5 rounded-[0.55rem] text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
        className
      )}
      aria-label="Vela home"
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
          className="object-contain"
          aria-hidden="true"
        />
      </span>
      {!compact ? (
        <span className="flex flex-col">
          <span
            className={cn(
              "font-semibold leading-none tracking-tight text-[var(--brand-ink)]",
              isLg ? "text-2xl" : "text-xl"
            )}
          >
            Vela
          </span>
          {includeSubtitle ? (
            <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Clinic OS
            </span>
          ) : null}
        </span>
      ) : null}
    </Link>
  );
}
