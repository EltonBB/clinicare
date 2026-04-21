import Link from "next/link";
 
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
        "inline-flex items-center gap-3 rounded-xl text-foreground",
        className
      )}
    >
      <span className="flex size-10 items-center justify-center rounded-[0.95rem] bg-primary text-sm font-semibold text-primary-foreground shadow-[0_12px_24px_var(--primary-shadow)]">
        V
      </span>
      {!compact ? (
        <span className="flex flex-col">
          <span className="text-xl font-semibold tracking-tight">Vela</span>
          {includeSubtitle ? (
            <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Service management
            </span>
          ) : null}
        </span>
      ) : null}
    </Link>
  );
}
