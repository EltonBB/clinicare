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
            "interactive-lift flex items-center gap-3 rounded-[1rem] border border-transparent px-2.5 py-2 transition-[background-color,border-color,box-shadow,transform] duration-200 hover:border-border/70 hover:bg-white/80 hover:shadow-[0_14px_28px_rgba(20,32,51,0.06)]",
          variant === "sidebar" &&
            "interactive-lift flex w-full items-center gap-3 rounded-[1rem] px-2 py-2 transition-[background-color,color,transform] duration-200 hover:bg-white/62"
        )}
      >
        <div
          className={cn(
            "flex items-center justify-center rounded-full text-sm font-semibold",
            variant === "header"
              ? "size-9 bg-primary/12 text-primary shadow-[0_10px_24px_var(--primary-shadow)]"
              : "size-10 bg-white/84 text-foreground shadow-[0_12px_28px_rgba(20,32,51,0.06)]"
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

      <DialogContent className="max-w-xl p-0 sm:max-w-xl">
        <div className="flex max-h-[calc(100vh-2rem)] min-h-0 flex-col overflow-hidden">
          <DialogHeader className="glass-divider shrink-0 space-y-3 px-6 pb-5 pt-6">
            <div className="flex size-[3.25rem] items-center justify-center rounded-[1.1rem] bg-primary/12 text-primary shadow-[0_14px_28px_var(--primary-shadow)]">
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

          <form action={formAction} className="flex min-h-0 flex-1 flex-col">
            <div className="dialog-scroll-body min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-5">
              <div className="space-y-5">
                {state.error ? (
                  <div className="rounded-[1rem] border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {state.error}
                  </div>
                ) : null}
                {!state.error && state.success ? (
                  <div className="rounded-[1rem] border border-primary/20 bg-primary/8 px-4 py-3 text-sm text-primary">
                    {state.success}
                  </div>
                ) : null}

                <div className="surface-soft section-reveal rounded-[1.1rem] p-5 transition-[transform,box-shadow,border-color,background-color] duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_36px_rgba(20,32,51,0.06)]">
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">Profile</p>
                      <p className="text-sm leading-6 text-muted-foreground">
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
                            "h-11 rounded-[0.9rem] bg-white/84",
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
                            "h-11 rounded-[0.9rem] bg-white/84",
                            state.fieldErrors?.phone && "border-destructive"
                          )}
                        />
                        <FieldError message={state.fieldErrors?.phone} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="surface-soft section-reveal-delayed rounded-[1.1rem] p-5 transition-[transform,box-shadow,border-color,background-color] duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_36px_rgba(20,32,51,0.06)]">
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">
                        Contact details
                      </p>
                      <p className="text-sm leading-6 text-muted-foreground">
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
                          "h-11 rounded-[0.9rem] bg-white/84",
                          state.fieldErrors?.email && "border-destructive"
                        )}
                      />
                      <FieldError message={state.fieldErrors?.email} />
                    </div>
                  </div>
                </div>

                <div className="surface-soft section-reveal-delayed rounded-[1.1rem] p-5 transition-[transform,box-shadow,border-color,background-color] duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_36px_rgba(20,32,51,0.06)]">
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">
                        Security
                      </p>
                      <p className="text-sm leading-6 text-muted-foreground">
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
                            "h-11 rounded-[0.9rem] bg-white/84",
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
                            "h-11 rounded-[0.9rem] bg-white/84",
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

            <div className="glass-divider flex shrink-0 items-center justify-end gap-3 border-t border-white/60 bg-white/72 px-5 py-4 backdrop-blur-sm">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-10 items-center justify-center rounded-[0.9rem] border border-border bg-white/70 px-4 text-sm font-medium text-foreground transition-[background-color,border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_14px_30px_rgba(20,32,51,0.08)]"
              >
                Close
              </button>
              <SubmitButton
                pendingLabel="Saving..."
                className="h-10 rounded-[0.9rem] px-4 text-sm font-medium"
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
