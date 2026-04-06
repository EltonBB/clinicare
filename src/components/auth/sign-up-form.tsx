"use client";

import { useActionState } from "react";
import { ChevronDown } from "lucide-react";

import { signUpAction, type AuthActionState } from "@/app/(auth)/actions";
import { SubmitButton } from "@/components/auth/submit-button";
import { Input } from "@/components/ui/input";
import { businessTypes } from "@/lib/constants";
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
        <FieldLabel>Business Name</FieldLabel>
        <Input
          name="businessName"
          placeholder="e.g. Acme Clinic"
          defaultValue={state.values?.businessName}
          aria-invalid={Boolean(state.fieldErrors?.businessName)}
          className={cn(
            "h-12 rounded-[0.95rem] border-border bg-card px-4 text-[15px] shadow-none placeholder:text-muted-foreground/70",
            state.fieldErrors?.businessName && "border-destructive"
          )}
        />
        <FieldError message={state.fieldErrors?.businessName} />
      </div>

      <div className="space-y-3">
        <FieldLabel>Your Name</FieldLabel>
        <Input
          name="fullName"
          placeholder="John Doe"
          defaultValue={state.values?.fullName}
          aria-invalid={Boolean(state.fieldErrors?.fullName)}
          className={cn(
            "h-12 rounded-[0.95rem] border-border bg-card px-4 text-[15px] shadow-none placeholder:text-muted-foreground/70",
            state.fieldErrors?.fullName && "border-destructive"
          )}
        />
        <FieldError message={state.fieldErrors?.fullName} />
      </div>

      <div className="space-y-3">
        <FieldLabel>Email</FieldLabel>
        <Input
          name="email"
          type="email"
          placeholder="name@company.com"
          defaultValue={state.values?.email}
          aria-invalid={Boolean(state.fieldErrors?.email)}
          className={cn(
            "h-12 rounded-[0.95rem] border-border bg-card px-4 text-[15px] shadow-none placeholder:text-muted-foreground/70",
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
            "h-12 rounded-[0.95rem] border-border bg-card px-4 text-[15px] shadow-none placeholder:text-muted-foreground/70",
            state.fieldErrors?.password && "border-destructive"
          )}
        />
        <FieldError message={state.fieldErrors?.password} />
      </div>

      <div className="space-y-3">
        <FieldLabel>Business Type</FieldLabel>
        <div className="relative">
          <select
            name="businessType"
            defaultValue={state.values?.businessType ?? ""}
            className={cn(
              "h-12 w-full appearance-none rounded-[0.95rem] border border-border bg-card px-4 pr-11 text-[15px] text-foreground shadow-none outline-none transition-colors focus:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
              state.fieldErrors?.businessType && "border-destructive"
            )}
            aria-invalid={Boolean(state.fieldErrors?.businessType)}
          >
            <option value="" disabled>
              Select business type
            </option>
            {businessTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        </div>
        <FieldError message={state.fieldErrors?.businessType} />
      </div>

      <div className="space-y-3 pt-3">
        <SubmitButton
          pendingLabel="Creating account..."
          className="h-12 w-full rounded-[0.95rem] text-[15px] font-medium"
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
