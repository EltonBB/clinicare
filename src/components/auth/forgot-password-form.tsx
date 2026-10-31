"use client";

import { useActionState } from "react";

import {
  forgotPasswordAction,
  type PasswordResetActionState,
} from "@/app/(auth)/actions";
import { SubmitButton } from "@/components/auth/submit-button";
import { authFieldClassName } from "@/components/auth/field-styles";
import { Input } from "@/components/ui/input";
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

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(forgotPasswordAction, initialState);
  const t = useI18n().m.auth;
  const serverText = useServerText();

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? (
        <div className="state-pop rounded-(--radius-field) border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {serverText(state.error)}
        </div>
      ) : null}

      {!state.error && state.success ? (
        <div className="state-pop rounded-(--radius-field) border border-primary/20 bg-primary/8 px-4 py-3 text-sm text-primary">
          {serverText(state.success)}
        </div>
      ) : null}

      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-semibold text-foreground">
          {t.fields.email}
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder={t.fields.emailPlaceholder}
          defaultValue={state.values?.email}
          aria-invalid={Boolean(state.fieldErrors?.email)}
          className={cn(authFieldClassName, state.fieldErrors?.email && "border-destructive")}
        />
        <FieldError message={state.fieldErrors?.email} />
      </div>

      <SubmitButton
        pendingLabel={t.forgot.pending}
        className="h-12 w-full rounded-(--radius-field) text-[15px] font-semibold"
      >
        {t.forgot.submit}
      </SubmitButton>
    </form>
  );
}
