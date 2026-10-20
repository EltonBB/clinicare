import { cn } from "@/lib/utils";

export function Toggle({
  checked,
  onPressedChange,
  ariaLabel,
}: {
  checked: boolean;
  onPressedChange: (checked: boolean) => void;
  /** Accessible name — the switch has no text of its own, so callers pass its row label. */
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      aria-label={ariaLabel}
      onClick={() => onPressedChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 rounded-full shadow-[inset_0_1px_3px_rgba(20,32,51,0.12)] transition-colors duration-(--duration-base)",
        checked ? "bg-primary" : "bg-border"
      )}
    >
      <span
        className={cn(
          "absolute top-1 size-4 rounded-full bg-white transition-transform",
          checked ? "translate-x-5" : "translate-x-1"
        )}
      />
    </button>
  );
}
