import { Pause, Play } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Pause/play for content that moves on its own (the marquees). Hover and
 * focus already pause them on desktop; this is the control that also works
 * on touch. Hidden under reduced motion, where nothing moves.
 */
export function PauseToggle({ paused, onToggle, label, className }: { paused: boolean; onToggle: () => void; label: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={paused}
      aria-label={`${paused ? "Play" : "Pause"} ${label}`}
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border/70 bg-white text-muted-foreground transition-colors duration-(--duration-base) hover:text-[var(--brand-ink)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/45 motion-reduce:hidden",
        className,
      )}
    >
      {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
    </button>
  );
}
