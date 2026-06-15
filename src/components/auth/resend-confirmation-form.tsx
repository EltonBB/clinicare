"use client";

import { useActionState } from "react";

import {
  resendConfirmationAction,
  type AuthActionState,
} from "@/app/(auth)/actions";
import { SubmitButton } from "@/components/auth/submit-button";

const initialState: AuthActionState = {};

export function ResendConfirmationForm({
  email,
  ticket,
}: {
  email: string;
  ticket: string;
}) {
  const [state, formAction] = useActionState(
    resendConfirmationAction,
    initialState
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="email" defaultValue={email} />
      <input type="hidden" name="ticket" defaultValue={ticket} />

      {state.error ? (
        <div className="state-pop rounded-(--radius-field) border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {state.error}
        </div>
      ) : null}

      {state.success ? (
        <div className="state-pop rounded-(--radius-field) border border-primary/20 bg-primary/8 px-4 py-3 text-sm text-primary">
          {state.success}
        </div>
      ) : null}

      <SubmitButton
        pendingLabel="Sending..."
        className="h-12 w-full rounded-(--radius-field) text-[15px] font-medium"
      >
        Resend email
      </SubmitButton>
    </form>
  );
}
