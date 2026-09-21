import Link from "next/link";
import type { ReactNode } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { fieldSelectClass } from "@/components/workspace/workspace-layout";
import { cn } from "@/lib/utils";

export function FormField({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

// Native select for short fixed lists. An empty-string option renders as
// `emptyLabel` (used by optional fields like preferred contact method).
export function FormSelect({
  label,
  name,
  value,
  defaultValue,
  options,
  onChange,
  emptyLabel,
  className,
  selectClassName,
}: {
  label: string;
  name?: string;
  // Controlled (`value` + `onChange`) or uncontrolled (`name` + `defaultValue`,
  // read back from FormData) — pass one or the other.
  value?: string;
  defaultValue?: string;
  options: readonly string[];
  onChange?: (value: string) => void;
  emptyLabel?: string;
  className?: string;
  selectClassName?: string;
}) {
  return (
    <FormField label={label} className={className}>
      <select
        name={name}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        className={cn(fieldSelectClass, selectClassName)}
      >
        {options.map((option) => (
          <option key={option || "unset"} value={option}>
            {option || emptyLabel}
          </option>
        ))}
      </select>
    </FormField>
  );
}

export function FormError({ message }: { message: string }) {
  if (!message) {
    return null;
  }

  return (
    <p
      role="alert"
      className="rounded-(--radius-card) border border-destructive/20 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive"
    >
      {message}
    </p>
  );
}

// Footer row shared by every create/edit form: destructive record actions
// (children) sit quietly on the left, Cancel + the primary action on the right.
export function FormActions({
  cancelHref,
  submitLabel,
  isPending,
  children,
}: {
  cancelHref: string;
  submitLabel: string;
  isPending: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-1">{children}</div>
      <div className="flex justify-end gap-2">
        <Link href={cancelHref} className={buttonVariants({ variant: "outline" })}>
          Cancel
        </Link>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving..." : submitLabel}
        </Button>
      </div>
    </div>
  );
}

export function DestructiveTextButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="text-destructive hover:bg-destructive/8 hover:text-destructive"
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </Button>
  );
}
