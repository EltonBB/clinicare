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
    <form action={formAction} className="space-y-6">
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
          placeholder="Create a new password"
          defaultValue={state.values?.password}
          aria-invalid={Boolean(state.fieldErrors?.password)}
          className={cn(
            "h-12 rounded-[1rem] border-border/80 bg-white/84 px-4 text-[15px] shadow-none placeholder:text-muted-foreground/70",
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
          placeholder="Repeat the new password"
          defaultValue={state.values?.confirmPassword}
          aria-invalid={Boolean(state.fieldErrors?.confirmPassword)}
          className={cn(
            "h-12 rounded-[1rem] border-border/80 bg-white/84 px-4 text-[15px] shadow-none placeholder:text-muted-foreground/70",
            state.fieldErrors?.confirmPassword && "border-destructive"
          )}
        />
        <FieldError message={state.fieldErrors?.confirmPassword} />
      </div>

      <SubmitButton
        pendingLabel="Resetting password..."
        className="h-12 w-full rounded-[1rem] text-[15px] font-medium"
      >
        Set new password
      </SubmitButton>
    </form>
  );
}
