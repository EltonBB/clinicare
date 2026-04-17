"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, LoaderCircle, MessageCircleMore, ShieldCheck } from "lucide-react";

import {
  prepareWhatsAppLiveConnectionAction,
  refreshWhatsAppLiveConnectionAction,
  submitWhatsAppVerificationCodeAction,
} from "@/app/(workspace)/settings/actions";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { SettingsState } from "@/lib/settings";

type OnboardingWhatsAppSetupProps = {
  clinicName: string;
  connection: SettingsState["whatsapp"]["connection"];
};

function connectionStatusTone(
  status: SettingsState["whatsapp"]["connection"]["status"]
) {
  if (status === "CONNECTED") {
    return "bg-primary/10 text-primary";
  }

  if (status === "ERRORED") {
    return "bg-destructive/10 text-destructive";
  }

  return "bg-white text-muted-foreground ring-1 ring-border/70";
}

export function OnboardingWhatsAppSetup({
  clinicName,
  connection: initialConnection,
}: OnboardingWhatsAppSetupProps) {
  const [connection, setConnection] = useState(initialConnection);
  const [verificationCode, setVerificationCode] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState(initialConnection.lastError);
  const [isPreparingConnection, startPreparingConnection] = useTransition();
  const [isRefreshingConnection, startRefreshingConnection] = useTransition();
  const [isSubmittingVerificationCode, startSubmittingVerificationCode] =
    useTransition();

  const isConnected = connection.status === "CONNECTED";
  const needsVerificationCode =
    connection.status === "PENDING_VERIFICATION" ||
    connection.status === "CONNECTING";

  function applyConnectionUpdate(
    nextConnection: SettingsState["whatsapp"]["connection"] | undefined
  ) {
    if (nextConnection) {
      setConnection(nextConnection);
      setErrorMessage(nextConnection.lastError);
    }
  }

  function handlePrepareLiveConnection() {
    startPreparingConnection(async () => {
      const result = await prepareWhatsAppLiveConnectionAction();
      applyConnectionUpdate(result.connection);

      if (!result.ok) {
        setStatusMessage("");
        setErrorMessage(
          result.error ?? "We couldn't start the clinic WhatsApp connection."
        );
        return;
      }

      setErrorMessage("");
      setStatusMessage(result.message ?? "Clinic number connection started.");
    });
  }

  function handleRefreshLiveConnection() {
    startRefreshingConnection(async () => {
      const result = await refreshWhatsAppLiveConnectionAction();
      applyConnectionUpdate(result.connection);

      if (!result.ok) {
        setStatusMessage("");
        setErrorMessage(
          result.error ?? "We couldn't refresh the clinic WhatsApp status."
        );
        return;
      }

      setErrorMessage("");
      setStatusMessage(result.message ?? "Latest clinic WhatsApp status loaded.");
    });
  }

  function handleSubmitVerificationCode() {
    startSubmittingVerificationCode(async () => {
      const result = await submitWhatsAppVerificationCodeAction(verificationCode);
      applyConnectionUpdate(result.connection);

      if (!result.ok) {
        setStatusMessage("");
        setErrorMessage(
          result.error ?? "We couldn't submit the verification code."
        );
        return;
      }

      setVerificationCode("");
      setErrorMessage("");
      setStatusMessage(
        result.message ?? "Verification code submitted successfully."
      );
    });
  }

  return (
    <div className="w-full max-w-4xl space-y-6">
      <div className="flex justify-center">
        <div className="flex size-24 items-center justify-center rounded-[1.75rem] bg-primary/14 text-primary">
          {isConnected ? (
            <CheckCircle2 className="size-12" />
          ) : (
            <ShieldCheck className="size-12" />
          )}
        </div>
      </div>

      <div className="space-y-4 text-center">
        <h1 className="text-5xl font-semibold tracking-tight text-foreground">
          {isConnected ? "WhatsApp is connected." : "Connect clinic WhatsApp."}
        </h1>
        <p className="mx-auto max-w-2xl text-lg leading-8 text-muted-foreground">
          {isConnected
            ? `${clinicName} is ready for live WhatsApp messaging. You can now open the dashboard and continue with the workspace setup.`
            : "Your clinic details are saved. Stay on this screen until the number is verified, or complete the action requested below."}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-primary">
          {connection.provider}
        </span>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-foreground">
          {connection.modeLabel}
        </span>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em]",
            connectionStatusTone(connection.status)
          )}
        >
          {connection.statusLabel}
        </span>
      </div>

      <Card className="surface-card">
        <CardContent className="space-y-5 p-6">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Clinic sender readiness
            </p>
            <p className="text-2xl font-semibold text-foreground">
              {connection.readinessLabel}
            </p>
            <p className="text-sm leading-7 text-muted-foreground">
              {connection.detail}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[0.9rem] border border-border/80 bg-white/88 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Requested number
              </p>
              <p className="mt-2 text-sm font-medium text-foreground">
                {connection.requestedPhoneNumber || "Not set"}
              </p>
            </div>
            <div className="rounded-[0.9rem] border border-border/80 bg-white/88 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Active sender
              </p>
              <p className="mt-2 text-sm font-medium text-foreground">
                {connection.senderPhoneNumber || "Awaiting live sender assignment"}
              </p>
            </div>
            <div className="rounded-[0.9rem] border border-border/80 bg-white/88 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Verification
              </p>
              <p className="mt-2 text-sm font-medium text-foreground">
                {connection.verificationLabel}
              </p>
              <p className="mt-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                Display name {connection.displayNameLabel}
              </p>
            </div>
            <div className="rounded-[0.9rem] border border-border/80 bg-white/88 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Provider sender id
              </p>
              <p className="mt-2 break-all text-sm font-medium text-foreground">
                {connection.externalSenderId || "Pending provider registration"}
              </p>
            </div>
          </div>

          {errorMessage ? (
            <div className="rounded-[0.9rem] border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {errorMessage}
            </div>
          ) : null}
          {!errorMessage && statusMessage ? (
            <div className="rounded-[0.9rem] border border-primary/20 bg-primary/8 px-4 py-3 text-sm text-primary">
              {statusMessage}
            </div>
          ) : null}

          {needsVerificationCode ? (
            <div className="rounded-[1rem] border border-border/80 bg-muted/35 px-4 py-4">
              <div className="flex items-start gap-3">
                <MessageCircleMore className="mt-0.5 size-5 text-primary" />
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Verification code
                    </p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      If Twilio sends a code to the clinic number, paste it here to
                      finish the connection.
                    </p>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Input
                      value={verificationCode}
                      onChange={(event) => setVerificationCode(event.target.value)}
                      placeholder="Enter code"
                      className="h-11 rounded-[0.9rem] bg-white/84"
                    />
                    <Button
                      variant="outline"
                      className="h-11 rounded-[0.9rem] bg-white/84 px-5"
                      onClick={handleSubmitVerificationCode}
                      disabled={isSubmittingVerificationCode}
                    >
                      {isSubmittingVerificationCode ? "Submitting..." : "Submit code"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button
              className="h-11 rounded-[0.95rem] px-5"
              onClick={handlePrepareLiveConnection}
              disabled={isPreparingConnection}
            >
              {isPreparingConnection ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  Starting...
                </>
              ) : connection.externalSenderId ? (
                "Reconnect clinic number"
              ) : (
                "Start clinic connection"
              )}
            </Button>
            <Button
              variant="outline"
              className="h-11 rounded-[0.95rem] bg-white/84 px-5"
              onClick={handleRefreshLiveConnection}
              disabled={isRefreshingConnection}
            >
              {isRefreshingConnection ? "Refreshing..." : "Refresh status"}
            </Button>
            {isConnected ? (
              <Link
                href="/dashboard"
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "h-11 rounded-[0.95rem] bg-white/84 px-5"
                )}
              >
                Open dashboard
                <ArrowRight data-icon="inline-end" />
              </Link>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
