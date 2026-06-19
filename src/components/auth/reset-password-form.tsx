"use client";

import { useActionState } from "react";

import {
  resetPasswordAction,
  type PasswordResetActionState,
} from "@/app/(auth)/actions";
import { SubmitButton } from "@/components/auth/submit-button";
import { authFieldClassName } from "@/components/auth/field-styles";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const initialState: PasswordResetActionState = {};

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="state-pop text-xs text-destructive">{message}</p>;
}

export function ResetPasswordForm() {
  const [state, formAction] = useActionState(resetPasswordAction, initialState);

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? (
        <div className="state-pop rounded-(--radius-field) border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {state.error}
        </div>
      ) : null}

      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-semibold text-foreground">
          New password
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="Create a new password"
          defaultValue={state.values?.password}
          aria-invalid={Boolean(state.fieldErrors?.password)}
          className={cn(authFieldClassName, state.fieldErrors?.password && "border-destructive")}
        />
        <FieldError message={state.fieldErrors?.password} />
      </div>

      <div className="space-y-2">
        <label htmlFor="confirmPassword" className="text-sm font-semibold text-foreground">
          Confirm password
        </label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          placeholder="Repeat the new password"
          defaultValue={state.values?.confirmPassword}
          aria-invalid={Boolean(state.fieldErrors?.confirmPassword)}
          className={cn(authFieldClassName, state.fieldErrors?.confirmPassword && "border-destructive")}
        />
        <FieldError message={state.fieldErrors?.confirmPassword} />
      </div>

      <SubmitButton
        pendingLabel="Resetting password..."
        className="h-12 w-full rounded-(--radius-field) text-[15px] font-semibold"
      >
        Set new password
      </SubmitButton>
    </form>
  );
}
