import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * Shared route-level loading screen: the Vela mark over a calm indeterminate bar.
 * Pure CSS animation (reuses the landing-loader keyframes), so it works inside a
 * server `loading.tsx` with no client JS. Reduced-motion users get a static bar.
 * The caller wraps it to set the surface height (full-screen or a shell slot).
 */
export function PageLoading({ className, label = "Loading…" }: { className?: string; label?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-6", className)} role="status" aria-live="polite">
      <div className="flex items-center gap-2.5">
        <Image
          src="/brand/vela-icon.svg"
          alt=""
          width={34}
          height={34}
          aria-hidden
          className="object-contain motion-safe:animate-[vela-loader-breathe_1.8s_ease-in-out_infinite]"
        />
        <span className="text-2xl font-semibold tracking-tight text-[var(--brand-ink)]">Vela</span>
      </div>
      <div className="relative h-1 w-44 overflow-hidden rounded-full bg-[var(--brand-wash)]">
        <span className="absolute inset-y-0 left-0 w-2/5 rounded-full vela-gradient motion-safe:animate-[vela-loader-slide_1.15s_var(--ease-out-quint)_infinite] motion-reduce:w-full motion-reduce:opacity-50" />
      </div>
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
    </div>
  );
}
