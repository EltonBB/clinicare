"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Smartphone } from "lucide-react";

import {
  generateMobileAccessCodeAction,
  revokeMobileAccessAction,
} from "@/app/(workspace)/staff/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { MobileAccessStatus } from "@/lib/mobile/admin";

type MobileAccessCardProps = {
  staffId: string;
  initial: MobileAccessStatus;
};

export function MobileAccessCard({ staffId, initial }: MobileAccessCardProps) {
  const [status, setStatus] = useState(initial);
  const [error, setError] = useState("");
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [copied, setCopied] = useState(false);
  const [justRevoked, setJustRevoked] = useState(false);
  const [isPending, startTransition] = useTransition();

  const hasAccess = status.hasActiveCode || status.device !== null;

  function generate() {
    setError("");
    startTransition(async () => {
      const result = await generateMobileAccessCodeAction(staffId);
      if (!result.ok || !result.code) {
        setError(result.error ?? "We couldn't generate a code.");
        return;
      }
      setStatus((prev) => ({ ...prev, hasActiveCode: true }));
      setJustRevoked(false);
      setCopied(false);
      setGeneratedCode(result.code);
    });
  }

  function revoke() {
    setError("");
    startTransition(async () => {
      const result = await revokeMobileAccessAction(staffId);
      if (!result.ok) {
        setError(result.error ?? "We couldn't update mobile access.");
        return;
      }
      setStatus({ hasActiveCode: false, device: null });
      setConfirmRevoke(false);
      setJustRevoked(true);
    });
  }

  async function copyCode() {
    if (!generatedCode) return;
    try {
      await navigator.clipboard.writeText(generatedCode);
      setCopied(true);
    } catch {
      // Clipboard can be unavailable (insecure context) — the code is still
      // visible on screen for the admin to copy manually.
    }
  }

  return (
    <section className="surface-card mt-3.5 flex flex-col p-3.5">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-(--radius-tile) border border-border bg-white text-primary">
          <Smartphone className="size-5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">Mobile access</h3>
          <p className="text-xs text-muted-foreground">Vela Staff app sign-in</p>
        </div>
      </div>

      <div className="mt-3.5 rounded-(--radius-card) bg-primary/5 px-3.5 py-3">
        {status.device ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-semibold text-foreground">{status.device.label}</p>
              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                Paired
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{status.device.lastSeenLabel}</p>
          </>
        ) : status.hasActiveCode ? (
          <p className="text-sm text-muted-foreground">
            Code active — waiting for the staff member to sign in on their phone.
          </p>
        ) : justRevoked ? (
          <p className="text-sm text-muted-foreground">
            Access revoked. They&apos;ll need a new code to sign back in.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No device paired yet.</p>
        )}
      </div>

      {error ? <p className="mt-2.5 text-xs font-medium text-destructive">{error}</p> : null}

      <div className="mt-3.5 flex flex-col gap-2">
        <Button variant="outline" size="sm" onClick={generate} disabled={isPending} className="bg-white">
          {hasAccess ? "Regenerate code" : "Generate code"}
        </Button>
        {hasAccess ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmRevoke(true)}
            disabled={isPending}
            className="text-destructive hover:text-destructive"
          >
            Revoke access
          </Button>
        ) : null}
      </div>

      {/* Copy-once code dialog */}
      <Dialog open={generatedCode !== null} onOpenChange={(open) => !open && setGeneratedCode(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mobile access code</DialogTitle>
            <DialogDescription>
              Share this code with the staff member. It is shown once — copy it now.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-(--radius-card) border border-border bg-muted/40 px-4 py-4 text-center">
            <span className="select-all font-mono text-xl font-semibold tracking-[0.18em] text-foreground">
              {generatedCode}
            </span>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={copyCode}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Copied" : "Copy code"}
            </Button>
            <Button size="sm" onClick={() => setGeneratedCode(null)}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Revoke confirmation */}
      <Dialog open={confirmRevoke} onOpenChange={(open) => !open && setConfirmRevoke(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Revoke mobile access?</DialogTitle>
            <DialogDescription>
              This signs the staff member out of the Vela Staff app and invalidates any unused
              code. They will need a new code to sign back in.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmRevoke(false)} disabled={isPending}>
              Keep access
            </Button>
            <Button
              size="sm"
              onClick={revoke}
              disabled={isPending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Revoke
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
