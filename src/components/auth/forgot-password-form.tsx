"use client";

import { useActionState } from "react";

import {
  forgotPasswordAction,
  type PasswordResetActionState,
} from "@/app/(auth)/actions";
import { SubmitButton } from "@/components/auth/submit-button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const initialState: PasswordResetActionState = {};

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

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(forgotPasswordAction, initialState);

  return (
    <form action={formAction} className="space-y-6">
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

      <div className="space-y-3">
        <FieldLabel>Email</FieldLabel>
        <Input
          name="email"
          type="email"
          placeholder="name@company.com"
          defaultValue={state.values?.email}
          aria-invalid={Boolean(state.fieldErrors?.email)}
          className={cn(
            "h-12 rounded-[0.95rem] border-border bg-card px-4 text-[15px] shadow-none placeholder:text-muted-foreground/70",
            state.fieldErrors?.email && "border-destructive"
          )}
        />
        <FieldError message={state.fieldErrors?.email} />
      </div>

      <SubmitButton
        pendingLabel="Sending link..."
        className="h-12 w-full rounded-[0.95rem] text-[15px] font-medium"
      >
        Send reset link
      </SubmitButton>
    </form>
  );
}
