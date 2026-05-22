import Link from "next/link";
import Image from "next/image";
 
import { cn } from "@/lib/utils";

type BrandMarkProps = {
  compact?: boolean;
  href?: string;
  className?: string;
  includeSubtitle?: boolean;
};

export function BrandMark({
  compact = false,
  href = "/dashboard",
  className,
  includeSubtitle = true,
}: BrandMarkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-3 rounded-[1rem] text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
        className
      )}
      aria-label="Vela home"
    >
      <span className="vela-icon-tile size-10 p-2.5">
        <Image
          src="/brand/vela-icon.svg"
          alt=""
          width={28}
          height={28}
          className="size-full object-contain"
          aria-hidden="true"
        />
      </span>
      {!compact ? (
        <span className="flex flex-col">
          <span className="text-xl font-semibold leading-none tracking-tight text-[var(--brand-ink)]">
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
