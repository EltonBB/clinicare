"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, LoaderCircle, Mail } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { createClient } from "@/utils/supabase/client";

type ConfirmState = "verifying" | "verified" | "already" | "error";

function sanitizeNextPath(next?: string | null) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/dashboard";
  }

  return next;
}

export function AuthConfirmScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasHandled = useRef(false);
  const [state, setState] = useState<ConfirmState>("verifying");
  const [message, setMessage] = useState("Confirming your email now.");

  const next = useMemo(
    () => sanitizeNextPath(searchParams.get("next")),
    [searchParams]
  );

  useEffect(() => {
    if (hasHandled.current || typeof window === "undefined") {
      return;
    }

    hasHandled.current = true;

    const supabase = createClient();
    const url = new URL(window.location.href);
    const hash = url.hash.startsWith("#") ? url.hash.slice(1) : "";
    const hashParams = new URLSearchParams(hash);
    const queryType = searchParams.get("type");
    const hashType = hashParams.get("type");
    const callbackType = queryType || hashType;
    const tokenHash = searchParams.get("token_hash");
    const code = searchParams.get("code");
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");
    const nestedNext = new URL(next, window.location.origin);
    const ticket = nestedNext.searchParams.get("ticket");

    async function markTicketVerified() {
      if (!ticket) {
        return;
      }

      await fetch("/api/auth/email-verification-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ticket }),
      });
    }

    async function handleVerification() {
      let authError: string | null = null;
      const isEmailVerification =
        callbackType === "signup" || callbackType === "email";

      if (tokenHash && callbackType) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: callbackType as "signup" | "recovery" | "email" | "email_change",
        });
        authError = error?.message ?? null;
      } else if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        authError = error?.message ?? null;
      } else if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        authError = error?.message ?? null;
      } else {
        authError = "missing_callback";
      }

      if (callbackType === "recovery" && !authError) {
        router.replace("/reset-password?recovery=1");
        return;
      }

      if (callbackType === "email_change" && !authError) {
        router.replace("/settings?email_updated=1");
        return;
      }

      if (!authError) {
        await markTicketVerified();
        await supabase.auth.signOut();
        setState("verified");
        setMessage("Congratulations. Your email has been verified.");
        return;
      }

      if (isEmailVerification || authError === "missing_callback") {
        await markTicketVerified();
        await supabase.auth.signOut();
        setState("verified");
        setMessage("Congratulations. Your email has been verified.");
        return;
      }

      setState("error");
      setMessage("That verification link is no longer valid. Request a new one below.");
    }

    void handleVerification();
  }, [next, router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="surface-card w-full max-w-md overflow-hidden rounded-[1.6rem] border border-border bg-card px-8 py-10 text-center shadow-sm sm:px-10">
        <div className="space-y-6">
          <BrandMark href="/login" includeSubtitle={false} className="justify-center" />
          <div
            className={`mx-auto flex size-[5.25rem] items-center justify-center rounded-full ${
              state === "error" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
            }`}
          >
            {state === "verifying" ? (
              <LoaderCircle className="size-8 animate-spin" />
            ) : state === "error" ? (
              <Mail className="size-8" />
            ) : (
              <CheckCircle2 className="size-8" />
            )}
          </div>
          <div className="space-y-3">
            <h1 className="text-[2rem] font-semibold tracking-tight text-foreground">
              {state === "verifying"
                ? "Verifying your email"
                : state === "error"
                  ? "Verification issue"
                  : "Email verified"}
            </h1>
            <p className="text-[15px] leading-7 text-muted-foreground">{message}</p>
          </div>
          {state === "verified" || state === "already" ? (
            <Link
              href="/login?verified=1"
              className="flex h-12 items-center justify-center rounded-[0.95rem] bg-primary px-5 text-sm font-medium text-primary-foreground transition-transform hover:-translate-y-0.5"
            >
              Continue to login
            </Link>
          ) : null}
          {state === "error" ? (
            <Link
              href="/confirm-email"
              className="flex h-12 items-center justify-center rounded-[0.95rem] border border-border px-5 text-sm font-medium text-foreground transition-colors hover:bg-muted/70"
            >
              Back to confirmation
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
