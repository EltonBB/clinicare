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

/**
 * A settings row: a switch and its label, then `children` (the row's inline
 * control) while it is on, or a muted "Off" while it is off.
 */
export function ToggleRow({
  label,
  enabled,
  onEnabledChange,
  children,
}: {
  label: string;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <Toggle checked={enabled} onPressedChange={onEnabledChange} ariaLabel={label} />
        <p className="text-sm font-medium text-foreground">{label}</p>
      </div>
      {enabled ? (
        <div className="pl-[52px] sm:pl-0">{children}</div>
      ) : (
        <span className="pl-[52px] text-xs text-muted-foreground sm:pl-0">Off</span>
      )}
    </div>
  );
}
