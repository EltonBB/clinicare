"use client";

import { useActionState, useEffect, useState } from "react";
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
    <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
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
            "flex items-center gap-2.5 rounded-full border border-transparent py-1 pl-1 pr-3 transition-[background-color,border-color] duration-(--duration-base) hover:border-border/70 hover:bg-[#f7f9fc] active:bg-[#eef2f8]",
          variant === "sidebar" &&
            "flex w-full items-center gap-3 rounded-(--radius-tile) px-2 py-2 transition-[background-color,color] duration-(--duration-base) hover:bg-[#f7f9fc]"
        )}
      >
        <div
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full border border-border/70 bg-[#f3f6fb] font-semibold text-primary",
            variant === "header" ? "size-8 text-xs" : "size-9 text-sm"
          )}
        >
          {ownerName
            .split(" ")
            .map((part) => part[0])
            .join("")
            .slice(0, 2)}
        </div>
        <div className="min-w-0 text-left">
          <p className="truncate text-sm font-medium leading-4 text-foreground">
            {ownerName}
          </p>
          <p className="truncate text-[11px] leading-4 text-muted-foreground">
            {variant === "header" ? businessName : "Account"}
          </p>
        </div>
      </DialogTrigger>

      <DialogContent className="max-w-xl p-0 sm:max-w-xl">
        <div className="flex max-h-[calc(100vh-2rem)] min-h-0 flex-col overflow-hidden">
          <DialogHeader className="shrink-0 gap-1 border-b border-border/70 px-5 pb-4 pt-5">
            <DialogTitle className="text-lg font-semibold text-foreground">
              Owner account
            </DialogTitle>
            <DialogDescription className="max-w-md text-sm leading-6">
              Update the clinic owner profile details separately from the clinic
              settings.
            </DialogDescription>
          </DialogHeader>

          <form action={formAction} className="flex min-h-0 flex-1 flex-col">
            <div className="dialog-scroll-body min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="space-y-3">
                {state.error ? (
                  <div className="rounded-(--radius-field) border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {state.error}
                  </div>
                ) : null}
                {!state.error && state.success ? (
                  <div className="rounded-(--radius-field) border border-primary/20 bg-primary/8 px-4 py-3 text-sm text-primary">
                    {state.success}
                  </div>
                ) : null}

                <div className="rounded-(--radius-card) border border-border/75 bg-white p-4">
                  <div className="space-y-4">
                    <div className="space-y-0.5">
                      <p className="text-sm font-semibold text-foreground">Profile</p>
                      <p className="text-xs leading-5 text-muted-foreground">
                        Keep the account owner details current so messages,
                        confirmations, and ownership settings stay aligned.
                      </p>
                    </div>

                    <div className="grid gap-4">
                      <div className="space-y-2">
                        <FieldLabel>Name</FieldLabel>
                        <Input
                          name="fullName"
                          defaultValue={values.fullName}
                          aria-invalid={Boolean(state.fieldErrors?.fullName)}
                          className={cn(
                            "h-10 rounded-(--radius-field) bg-white",
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
                            "h-10 rounded-(--radius-field) bg-white",
                            state.fieldErrors?.phone && "border-destructive"
                          )}
                        />
                        <FieldError message={state.fieldErrors?.phone} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-(--radius-card) border border-border/75 bg-white p-4">
                  <div className="space-y-4">
                    <div className="space-y-0.5">
                      <p className="text-sm font-semibold text-foreground">
                        Contact details
                      </p>
                      <p className="text-xs leading-5 text-muted-foreground">
                        Update the email tied to the clinic owner account in a
                        dedicated section so it stays separate from security
                        changes.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <FieldLabel>Email</FieldLabel>
                      <Input
                        name="email"
                        type="email"
                        defaultValue={values.email}
                        aria-invalid={Boolean(state.fieldErrors?.email)}
                        className={cn(
                          "h-10 rounded-(--radius-field) bg-white",
                          state.fieldErrors?.email && "border-destructive"
                        )}
                      />
                      <FieldError message={state.fieldErrors?.email} />
                    </div>
                  </div>
                </div>

                <div className="rounded-(--radius-card) border border-border/75 bg-white p-4">
                  <div className="space-y-4">
                    <div className="space-y-0.5">
                      <p className="text-sm font-semibold text-foreground">
                        Security
                      </p>
                      <p className="text-xs leading-5 text-muted-foreground">
                        Rotate account access separately when you need a fresh
                        password.
                      </p>
                    </div>

                    <div className="grid gap-4">
                      <div className="space-y-2">
                        <FieldLabel>New password</FieldLabel>
                        <Input
                          name="newPassword"
                          type="password"
                          defaultValue={values.newPassword}
                          aria-invalid={Boolean(state.fieldErrors?.newPassword)}
                          className={cn(
                            "h-10 rounded-(--radius-field) bg-white",
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
                          aria-invalid={Boolean(
                            state.fieldErrors?.confirmPassword
                          )}
                          className={cn(
                            "h-10 rounded-(--radius-field) bg-white",
                            state.fieldErrors?.confirmPassword && "border-destructive"
                          )}
                        />
                        <FieldError message={state.fieldErrors?.confirmPassword} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border/70 bg-[#fafbfd] px-5 py-3.5">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-9 items-center justify-center rounded-(--radius-card) border border-border/75 bg-white px-3 text-sm font-semibold text-foreground transition-[background-color,border-color] duration-(--duration-base) hover:border-border hover:bg-[#f7f9fc] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/45"
              >
                Close
              </button>
              <SubmitButton
                variant="solid"
                pendingLabel="Saving..."
                className="h-9 rounded-(--radius-card) px-3.5 text-sm"
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
