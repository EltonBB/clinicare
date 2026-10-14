import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** The ink primary button, matching the auth pages' submit button. */
export const inkButtonClassName =
  "group/next h-12 rounded-(--radius-field) bg-[var(--brand-ink)] text-[15px] font-semibold text-white transition-[background-color,transform] duration-(--duration-base) ease-out-quint hover:bg-[var(--brand-ink)]/90 active:scale-[0.98]";

const selectClassName =
  "h-10 w-full appearance-none rounded-(--radius-field) border border-border/80 bg-white px-3 text-sm text-foreground shadow-none outline-none transition-[border-color,box-shadow] duration-(--duration-base) hover:border-border focus-visible:border-primary/60 focus-visible:ring-4 focus-visible:ring-primary/10";

export function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-semibold text-foreground">
      {children}
    </label>
  );
}

export function Toggle({
  checked,
  onPressedChange,
  ariaLabel,
}: {
  checked: boolean;
  onPressedChange: (checked: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      aria-label={ariaLabel}
      onClick={() => onPressedChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-(--duration-base) focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15",
        checked ? "bg-[var(--brand-ink)]" : "bg-border"
      )}
    >
      <span
        className={cn(
          "absolute top-1 size-4 rounded-full bg-white shadow-[0_1px_3px_rgba(20,21,47,0.18)] transition-transform duration-(--duration-base) ease-out-quint motion-reduce:transition-none",
          checked ? "translate-x-6" : "translate-x-1"
        )}
      />
    </button>
  );
}

export function NativeSelect({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  ariaLabel: string;
  className?: string;
}) {
  return (
    <select
      value={value}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
      className={cn(selectClassName, className)}
    >
      {/* A saved value outside the list (an older draft) still shows as chosen. */}
      {options.includes(value) ? null : <option value={value}>{value}</option>}
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}
