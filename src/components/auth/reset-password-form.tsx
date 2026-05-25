"use client";

import { useActionState } from "react";

import {
  resetPasswordAction,
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

export function ResetPasswordForm() {
  const [state, formAction] = useActionState(resetPasswordAction, initialState);

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? (
        <div className="rounded-[1rem] border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {state.error}
        </div>
      ) : null}

      <div className="space-y-3">
        <FieldLabel>New password</FieldLabel>
        <Input
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="Create a new password"
          defaultValue={state.values?.password}
          aria-invalid={Boolean(state.fieldErrors?.password)}
          className={cn(
            "h-11 rounded-[0.78rem] border-border/80 bg-white px-3.5 text-[15px] shadow-none placeholder:text-muted-foreground/70",
            state.fieldErrors?.password && "border-destructive"
          )}
        />
        <FieldError message={state.fieldErrors?.password} />
      </div>

      <div className="space-y-3">
        <FieldLabel>Confirm password</FieldLabel>
        <Input
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          placeholder="Repeat the new password"
          defaultValue={state.values?.confirmPassword}
          aria-invalid={Boolean(state.fieldErrors?.confirmPassword)}
          className={cn(
            "h-11 rounded-[0.78rem] border-border/80 bg-white px-3.5 text-[15px] shadow-none placeholder:text-muted-foreground/70",
            state.fieldErrors?.confirmPassword && "border-destructive"
          )}
        />
        <FieldError message={state.fieldErrors?.confirmPassword} />
      </div>

      <SubmitButton
        pendingLabel="Resetting password..."
        className="h-11 w-full rounded-[0.78rem] text-[15px] font-medium"
      >
        Set new password
      </SubmitButton>
    </form>
  );
}
