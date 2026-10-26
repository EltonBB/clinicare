"use client";

import { useActionState, useState } from "react";
import { Check } from "lucide-react";

import { signUpAction, type AuthActionState } from "@/app/(auth)/actions";
import { SubmitButton } from "@/components/auth/submit-button";
import { authFieldClassName } from "@/components/auth/field-styles";
import { PasswordInput } from "@/components/auth/password-input";
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
  const [length, setLength] = useState(0);
  const long = length >= 8;

  return (
    <form action={formAction} onReset={() => setLength(0)} className="space-y-5">
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
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          placeholder="Create a password"
          aria-invalid={Boolean(state.fieldErrors?.password)}
          aria-describedby="password-rule"
          onChange={(e) => setLength(e.target.value.length)}
          className={cn(authFieldClassName, state.fieldErrors?.password && "border-destructive")}
        />
        <div className="flex items-center gap-3 pt-1">
          <span aria-hidden className="flex flex-1 gap-1">
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors duration-(--duration-slow) ease-out-quint",
                  length > i * 2 ? (long ? "bg-primary" : "bg-[var(--brand-ink)]/35") : "bg-border",
                )}
              />
            ))}
          </span>
          <span id="password-rule" className={cn("flex items-center gap-1 text-xs font-medium transition-colors duration-(--duration-base)", long ? "text-primary" : "text-muted-foreground")}>
            <Check className={cn("size-3.5 transition-[opacity,transform] duration-(--duration-base)", long ? "scale-100 opacity-100" : "scale-75 opacity-0")} />
            At least 8 characters
          </span>
        </div>
        <FieldError message={state.fieldErrors?.password} />
      </div>

      <div className="space-y-3 pt-1">
        <SubmitButton
          pendingLabel="Creating account..."
          className="h-12 w-full rounded-(--radius-field) text-[15px] font-semibold"
        >
          Create account
        </SubmitButton>
        <p className="text-center text-xs text-muted-foreground">Then set up your clinic and start your 14-day free trial.</p>
      </div>
    </form>
  );
}
