"use client";

import { useActionState, useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  updateOwnerProfileAction,
  type OwnerProfileActionState,
} from "@/app/(auth)/actions";
import { SubmitButton } from "@/components/auth/submit-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type OwnerAccountDialogProps = {
  ownerName: string;
  ownerEmail: string;
  ownerPhone?: string;
  businessName: string;
  variant: "header" | "sidebar";
};

const initialState: OwnerProfileActionState = {};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
      {children}
    </label>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="text-xs text-destructive">{message}</p>;
}

export function OwnerAccountDialog({
  ownerName,
  ownerEmail,
  ownerPhone = "",
  businessName,
  variant,
}: OwnerAccountDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(updateOwnerProfileAction, initialState);

  useEffect(() => {
    if (state.success) {
      router.refresh();
    }
  }, [router, state.success]);

  const values = {
    fullName: state.values?.fullName ?? ownerName,
    email: state.values?.email ?? ownerEmail,
    phone: state.values?.phone ?? ownerPhone,
    newPassword: state.values?.newPassword ?? "",
    confirmPassword: state.values?.confirmPassword ?? "",
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className={cn(
          variant === "header" &&
            "flex items-center gap-3 rounded-[0.85rem] px-2 py-2 transition-colors hover:bg-secondary/70",
          variant === "sidebar" &&
            "flex items-center gap-3 rounded-[0.85rem] px-2 py-2 transition-colors hover:bg-sidebar-accent"
        )}
      >
        <div
          className={cn(
            "flex items-center justify-center rounded-full text-sm font-semibold",
            variant === "header"
              ? "size-8 bg-primary/12 text-primary"
              : "size-10 bg-secondary text-foreground"
          )}
        >
          {ownerName
            .split(" ")
            .map((part) => part[0])
            .join("")
            .slice(0, 2)}
        </div>
        <div className="min-w-0 text-left">
          <p className="truncate text-sm font-medium text-foreground">{ownerName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {variant === "header" ? businessName : "Account"}
          </p>
        </div>
      </DialogTrigger>

      <DialogContent className="max-w-lg rounded-[1rem] border border-border bg-card p-0">
        <div className="space-y-6 px-6 py-6">
          <DialogHeader className="space-y-3">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/12 text-primary">
              <UserRound className="size-5" />
            </div>
            <div className="space-y-2">
              <DialogTitle className="text-2xl font-semibold text-foreground">
                Owner account
              </DialogTitle>
              <DialogDescription className="max-w-md text-sm leading-7">
                Update the clinic owner profile details separately from the clinic
                settings.
              </DialogDescription>
            </div>
          </DialogHeader>

          <form action={formAction} className="space-y-5">
            {state.error ? (
              <div className="rounded-[0.9rem] border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {state.error}
              </div>
            ) : null}
            {!state.error && state.success ? (
              <div className="rounded-[0.9rem] border border-primary/20 bg-primary/8 px-4 py-3 text-sm text-primary">
                {state.success}
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel>Name</FieldLabel>
                <Input
                  name="fullName"
                  defaultValue={values.fullName}
                  aria-invalid={Boolean(state.fieldErrors?.fullName)}
                  className={cn(
                    "h-11 rounded-[0.75rem] bg-card",
                    state.fieldErrors?.fullName && "border-destructive"
                  )}
                />
                <FieldError message={state.fieldErrors?.fullName} />
              </div>
              <div className="space-y-2">
                <FieldLabel>Phone</FieldLabel>
                <Input
                  name="phone"
                  defaultValue={values.phone}
                  aria-invalid={Boolean(state.fieldErrors?.phone)}
                  className={cn(
                    "h-11 rounded-[0.75rem] bg-card",
                    state.fieldErrors?.phone && "border-destructive"
                  )}
                />
                <FieldError message={state.fieldErrors?.phone} />
              </div>
            </div>

            <div className="space-y-2">
              <FieldLabel>Email</FieldLabel>
              <Input
                name="email"
                type="email"
                defaultValue={values.email}
                aria-invalid={Boolean(state.fieldErrors?.email)}
                className={cn(
                  "h-11 rounded-[0.75rem] bg-card",
                  state.fieldErrors?.email && "border-destructive"
                )}
              />
              <FieldError message={state.fieldErrors?.email} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <FieldLabel>New password</FieldLabel>
                <Input
                  name="newPassword"
                  type="password"
                  defaultValue={values.newPassword}
                  aria-invalid={Boolean(state.fieldErrors?.newPassword)}
                  className={cn(
                    "h-11 rounded-[0.75rem] bg-card",
                    state.fieldErrors?.newPassword && "border-destructive"
                  )}
                />
                <FieldError message={state.fieldErrors?.newPassword} />
              </div>
              <div className="space-y-2">
                <FieldLabel>Confirm password</FieldLabel>
                <Input
                  name="confirmPassword"
                  type="password"
                  defaultValue={values.confirmPassword}
                  aria-invalid={Boolean(state.fieldErrors?.confirmPassword)}
                  className={cn(
                    "h-11 rounded-[0.75rem] bg-card",
                    state.fieldErrors?.confirmPassword && "border-destructive"
                  )}
                />
                <FieldError message={state.fieldErrors?.confirmPassword} />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-10 items-center justify-center rounded-[0.75rem] border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
              >
                Close
              </button>
              <SubmitButton
                pendingLabel="Saving..."
                className="h-10 rounded-[0.75rem] px-4 text-sm font-medium"
              >
                Save account
              </SubmitButton>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
