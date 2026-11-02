"use client";

import { useActionState } from "react";

import {
  resendConfirmationAction,
  type AuthActionState,
} from "@/app/(auth)/actions";
import { SubmitButton } from "@/components/auth/submit-button";
import { useI18n, useServerText } from "@/i18n/client";

const initialState: AuthActionState = {};

export function ResendConfirmationForm({
  email,
  ticket,
}: {
  email: string;
  ticket: string;
}) {
  const t = useI18n().m.auth;
  const serverText = useServerText();
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
          {serverText(state.error)}
        </div>
      ) : null}

      {state.success ? (
        <div className="state-pop rounded-(--radius-field) border border-primary/20 bg-primary/8 px-4 py-3 text-sm text-primary">
          {serverText(state.success)}
        </div>
      ) : null}

      <SubmitButton
        pendingLabel={t.confirmEmail.resendPending}
        className="h-12 w-full rounded-(--radius-field) text-[15px] font-medium"
      >
        {t.confirmEmail.resend}
      </SubmitButton>
    </form>
  );
}
