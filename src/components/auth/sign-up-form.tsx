"use client";

import { useActionState } from "react";

import { signUpAction, type AuthActionState } from "@/app/(auth)/actions";
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

export function SignUpForm() {
  const [state, formAction] = useActionState(signUpAction, initialState);

  return (
    <form action={formAction} className="space-y-5">
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
        <label htmlFor="password" className="text-sm font-semibold text-foreground">
          Password
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="Create a password"
          aria-invalid={Boolean(state.fieldErrors?.password)}
          className={cn(authFieldClassName, state.fieldErrors?.password && "border-destructive")}
        />
        <FieldError message={state.fieldErrors?.password} />
      </div>

      <div className="space-y-3 pt-1">
        <SubmitButton
          pendingLabel="Creating account..."
          className="h-12 w-full rounded-(--radius-field) text-[15px] font-semibold"
        >
          Create account
        </SubmitButton>
        <p className="text-center text-xs text-muted-foreground">No credit card required.</p>
      </div>
    </form>
  );
}
