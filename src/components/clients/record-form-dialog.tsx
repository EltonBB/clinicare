"use client";

import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type RecordFieldType = "text" | "textarea" | "select" | "date" | "checkbox";

export type RecordField = {
  key: string;
  label: string;
  type?: RecordFieldType;
  options?: string[];
  placeholder?: string;
  required?: boolean;
  fullWidth?: boolean;
};

export type RecordFormValues = Record<string, string | boolean>;

function fieldDefault(field: RecordField): string | boolean {
  if (field.type === "checkbox") {
    return true;
  }

  if (field.type === "select") {
    return field.options?.[0] ?? "";
  }

  return "";
}

export function RecordFormDialog({
  open,
  onOpenChange,
  title,
  description,
  fields,
  initialValues,
  submitLabel = "Save",
  isPending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  fields: RecordField[];
  initialValues?: RecordFormValues;
  submitLabel?: string;
  isPending: boolean;
  onSubmit: (values: RecordFormValues) => void;
}) {
  const [values, setValues] = useState<RecordFormValues>({});

  useEffect(() => {
    if (!open) {
      return;
    }

    const next: RecordFormValues = {};

    for (const field of fields) {
      next[field.key] = initialValues?.[field.key] ?? fieldDefault(field);
    }

    setValues(next);
    // Reset only when the dialog opens for a (possibly different) record.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const missingRequired = fields.some(
    (field) => field.required && !String(values[field.key] ?? "").trim()
  );

  function setValue(key: string, value: string | boolean) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  const inputClasses = "h-10 w-full rounded-(--radius-card) bg-white";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 sm:max-w-lg">
        <div className="flex max-h-[calc(100vh-2rem)] min-h-0 flex-col overflow-hidden">
          <DialogHeader className="shrink-0 gap-1 border-b border-border/70 px-5 pb-4 pt-5">
            <DialogTitle className="text-lg font-semibold text-foreground">
              {title}
            </DialogTitle>
            {description ? (
              <DialogDescription className="text-sm leading-6">
                {description}
              </DialogDescription>
            ) : null}
          </DialogHeader>

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault();

              if (!missingRequired && !isPending) {
                onSubmit(values);
              }
            }}
          >
            <div className="dialog-scroll-body min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {fields.map((field) => (
                  <label
                    key={field.key}
                    className={cn(
                      "grid content-start gap-1.5 text-sm",
                      (field.fullWidth || field.type === "textarea") && "sm:col-span-2",
                      field.type === "checkbox" &&
                        "flex items-center gap-2 self-end pb-1"
                    )}
                  >
                    {field.type === "checkbox" ? (
                      <>
                        <input
                          type="checkbox"
                          checked={Boolean(values[field.key])}
                          onChange={(event) => setValue(field.key, event.target.checked)}
                          className="size-4 accent-[var(--primary)]"
                        />
                        <span className="font-medium text-foreground">{field.label}</span>
                      </>
                    ) : (
                      <>
                        <span className="font-medium text-foreground">
                          {field.label}
                          {field.required ? (
                            <span className="text-destructive"> *</span>
                          ) : null}
                        </span>
                        {field.type === "textarea" ? (
                          <Textarea
                            value={String(values[field.key] ?? "")}
                            onChange={(event) => setValue(field.key, event.target.value)}
                            placeholder={field.placeholder}
                            className="min-h-20 rounded-(--radius-card) bg-white px-3 py-2.5"
                          />
                        ) : field.type === "select" ? (
                          <select
                            value={String(values[field.key] ?? "")}
                            onChange={(event) => setValue(field.key, event.target.value)}
                            className="h-10 w-full rounded-(--radius-card) border border-border/80 bg-white px-3 text-sm outline-none transition-[border-color,box-shadow] duration-(--duration-base) focus:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
                          >
                            {(field.options ?? []).map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Input
                            type={field.type === "date" ? "date" : "text"}
                            value={String(values[field.key] ?? "")}
                            onChange={(event) => setValue(field.key, event.target.value)}
                            placeholder={field.placeholder}
                            className={inputClasses}
                          />
                        )}
                      </>
                    )}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-border/70 bg-[#fafbfd] px-5 py-3.5">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending}
                className="rounded-(--radius-tile)"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending || missingRequired}
                className="rounded-(--radius-tile)"
              >
                {isPending ? "Saving..." : submitLabel}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Delete",
  isPending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  isPending: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-5">
        <DialogHeader className="gap-2">
          <span className="flex size-9 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <TriangleAlert className="size-4" />
          </span>
          <DialogTitle className="text-base font-semibold text-foreground">
            {title}
          </DialogTitle>
          <DialogDescription className="text-sm leading-6">
            {description}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            className="rounded-(--radius-tile)"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={isPending}
            className="rounded-(--radius-tile)"
          >
            {isPending ? "Removing..." : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
