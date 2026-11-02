"use client";

import Link from "next/link";
import { useActionState } from "react";

import { loginAction, type AuthActionState } from "@/app/(auth)/actions";
import { SubmitButton } from "@/components/auth/submit-button";
import { authFieldClassName } from "@/components/auth/field-styles";
import { PasswordInput } from "@/components/auth/password-input";
import { Input } from "@/components/ui/input";
import { useI18n, useServerText } from "@/i18n/client";
import { cn } from "@/lib/utils";

const initialState: AuthActionState = {};

function FieldError({ message }: { message?: string }) {
  const serverText = useServerText();
  if (!message) {
    return null;
  }

  return <p className="state-pop text-xs text-destructive">{serverText(message)}</p>;
}

export function LoginForm({ nextPath = "/dashboard" }: { nextPath?: string }) {
  const [state, formAction] = useActionState(loginAction, initialState);
  const t = useI18n().m.auth;
  const serverText = useServerText();
  const next = state.values?.next ?? nextPath;

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="next" value={next} />

      {state.error ? (
        <div className="state-pop rounded-(--radius-field) border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {serverText(state.error)}
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

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="text-sm font-semibold text-foreground">
            {t.fields.password}
          </label>
          <Link href="/forgot-password" className="text-xs font-semibold text-primary hover:underline">
            {t.fields.forgot}
          </Link>
        </div>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          placeholder={t.fields.passwordPlaceholder}
          aria-invalid={Boolean(state.fieldErrors?.password)}
          className={cn(authFieldClassName, state.fieldErrors?.password && "border-destructive")}
        />
        <FieldError message={state.fieldErrors?.password} />
      </div>

      <SubmitButton
        pendingLabel={t.login.pending}
        className="h-12 w-full rounded-(--radius-field) text-[15px] font-semibold"
      >
        {t.login.submit}
      </SubmitButton>
    </form>
  );
}
