"use client";

import { useActionState } from "react";

import { signUpAction, type AuthActionState } from "@/app/(auth)/actions";
import { SubmitButton } from "@/components/auth/submit-button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const initialState: AuthActionState = {};

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

export function SignUpForm() {
  const [state, formAction] = useActionState(signUpAction, initialState);

  return (
    <form action={formAction} className="space-y-6">
      {state.error ? (
        <div className="rounded-[1rem] border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {state.error}
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
            "h-12 rounded-[1rem] border-border/80 bg-white/84 px-4 text-[15px] shadow-none placeholder:text-muted-foreground/70",
            state.fieldErrors?.email && "border-destructive"
          )}
        />
        <FieldError message={state.fieldErrors?.email} />
      </div>

      <div className="space-y-3">
        <FieldLabel>Password</FieldLabel>
        <Input
          name="password"
          type="password"
          placeholder="Create a password"
          defaultValue={state.values?.password}
          aria-invalid={Boolean(state.fieldErrors?.password)}
          className={cn(
            "h-12 rounded-[1rem] border-border/80 bg-white/84 px-4 text-[15px] shadow-none placeholder:text-muted-foreground/70",
            state.fieldErrors?.password && "border-destructive"
          )}
        />
        <FieldError message={state.fieldErrors?.password} />
      </div>

      <div className="space-y-3 pt-3">
        <SubmitButton
          pendingLabel="Creating account..."
          className="h-12 w-full rounded-[1rem] text-[15px] font-medium"
        >
          Create account
        </SubmitButton>
        <p className="text-center text-xs italic text-muted-foreground">
          No credit card required
        </p>
      </div>
    </form>
  );
}
