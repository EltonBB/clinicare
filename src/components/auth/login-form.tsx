"use client";

import Link from "next/link";
import { useActionState } from "react";

import { loginAction, type AuthActionState } from "@/app/(auth)/actions";
import { SubmitButton } from "@/components/auth/submit-button";
import { authFieldClassName } from "@/components/auth/field-styles";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const initialState: AuthActionState = {};

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="state-pop text-xs text-destructive">{message}</p>;
}

export function LoginForm({ nextPath = "/dashboard" }: { nextPath?: string }) {
  const [state, formAction] = useActionState(loginAction, initialState);
  const next = state.values?.next ?? nextPath;

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="next" value={next} />

      {state.error ? (
        <div className="state-pop rounded-(--radius-field) border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {state.error}
        </div>
      ) : null}

      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-semibold text-foreground">
          Email
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="name@clinic.com"
          defaultValue={state.values?.email}
          aria-invalid={Boolean(state.fieldErrors?.email)}
          className={cn(authFieldClassName, state.fieldErrors?.email && "border-destructive")}
        />
        <FieldError message={state.fieldErrors?.email} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="text-sm font-semibold text-foreground">
            Password
          </label>
          <Link href="/forgot-password" className="text-xs font-semibold text-primary hover:underline">
            Forgot?
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Enter your password"
          aria-invalid={Boolean(state.fieldErrors?.password)}
          className={cn(authFieldClassName, state.fieldErrors?.password && "border-destructive")}
        />
        <FieldError message={state.fieldErrors?.password} />
      </div>

      <SubmitButton
        pendingLabel="Logging in..."
        className="h-12 w-full rounded-(--radius-field) text-[15px] font-semibold"
      >
        Log in
      </SubmitButton>
    </form>
  );
}
