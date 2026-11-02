"use client";

import { useActionState } from "react";

import {
  resetPasswordAction,
  type PasswordResetActionState,
} from "@/app/(auth)/actions";
import { SubmitButton } from "@/components/auth/submit-button";
import { authFieldClassName } from "@/components/auth/field-styles";
import { PasswordInput } from "@/components/auth/password-input";
import { useI18n, useServerText } from "@/i18n/client";
import { cn } from "@/lib/utils";

const initialState: PasswordResetActionState = {};

function FieldError({ message }: { message?: string }) {
  const serverText = useServerText();
  if (!message) {
    return null;
  }

  return <p className="state-pop text-xs text-destructive">{serverText(message)}</p>;
}

export function ResetPasswordForm() {
  const [state, formAction] = useActionState(resetPasswordAction, initialState);
  const t = useI18n().m.auth;
  const serverText = useServerText();

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? (
        <div className="state-pop rounded-(--radius-field) border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {serverText(state.error)}
        </div>
      ) : null}

      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-semibold text-foreground">
          {t.fields.newPassword}
        </label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          placeholder={t.fields.newPasswordPlaceholder}
          aria-invalid={Boolean(state.fieldErrors?.password)}
          className={cn(authFieldClassName, state.fieldErrors?.password && "border-destructive")}
        />
        <FieldError message={state.fieldErrors?.password} />
      </div>

      <div className="space-y-2">
        <label htmlFor="confirmPassword" className="text-sm font-semibold text-foreground">
          {t.fields.confirmPassword}
        </label>
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          autoComplete="new-password"
          placeholder={t.fields.confirmPlaceholder}
          aria-invalid={Boolean(state.fieldErrors?.confirmPassword)}
          className={cn(authFieldClassName, state.fieldErrors?.confirmPassword && "border-destructive")}
        />
        <FieldError message={state.fieldErrors?.confirmPassword} />
      </div>

      <SubmitButton
        pendingLabel={t.reset.pending}
        className="h-12 w-full rounded-(--radius-field) text-[15px] font-semibold"
      >
        {t.reset.submit}
      </SubmitButton>
    </form>
  );
}
