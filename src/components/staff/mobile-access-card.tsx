"use client";

import { useState, useTransition } from "react";
import { Check, Copy } from "lucide-react";

import {
  generateMobileAccessCodeAction,
  revokeMobileAccessAction,
} from "@/app/(workspace)/staff/actions";
import { Button } from "@/components/ui/button";
import { useI18n, useServerText } from "@/i18n/client";
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
  const { m } = useI18n();
  const t = m.staff.mobile;
  const serverText = useServerText();
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
        setError(serverText(result.error) ?? t.generateFailed);
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
        setError(serverText(result.error) ?? t.updateFailed);
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
    <section className="surface-card flex flex-col p-3.5">
      <h3 className="text-sm font-semibold text-foreground">{t.title}</h3>
      <p className="text-xs text-muted-foreground">{t.subtitle}</p>

      <div className="mt-3.5 rounded-(--radius-card) bg-primary/5 px-3.5 py-3">
        {status.device ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-semibold text-foreground">{status.device.label}</p>
              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                {t.paired}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{status.device.lastSeenLabel}</p>
          </>
        ) : status.hasActiveCode ? (
          <p className="text-sm text-muted-foreground">{t.codeActive}</p>
        ) : justRevoked ? (
          <p className="text-sm text-muted-foreground">{t.revoked}</p>
        ) : (
          <p className="text-sm text-muted-foreground">{t.noDevice}</p>
        )}
      </div>

      {error ? <p className="mt-2.5 text-xs font-medium text-destructive">{error}</p> : null}

      <div className="mt-3.5 flex flex-col gap-2">
        <Button variant="outline" size="sm" onClick={generate} disabled={isPending} className="bg-white">
          {hasAccess ? t.regenerate : t.generate}
        </Button>
        {hasAccess ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmRevoke(true)}
            disabled={isPending}
            className="text-destructive hover:text-destructive"
          >
            {t.revokeAccess}
          </Button>
        ) : null}
      </div>

      {/* Copy-once code dialog */}
      <Dialog open={generatedCode !== null} onOpenChange={(open) => !open && setGeneratedCode(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t.codeTitle}</DialogTitle>
            <DialogDescription>{t.codeDescription}</DialogDescription>
          </DialogHeader>
          <div className="rounded-(--radius-card) border border-border bg-muted/40 px-4 py-4 text-center">
            <span className="select-all font-mono text-xl font-semibold tracking-[0.18em] text-foreground">
              {generatedCode}
            </span>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={copyCode}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? t.copied : t.copyCode}
            </Button>
            <Button size="sm" onClick={() => setGeneratedCode(null)}>
              {t.done}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Revoke confirmation */}
      <Dialog open={confirmRevoke} onOpenChange={(open) => !open && setConfirmRevoke(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t.revokeTitle}</DialogTitle>
            <DialogDescription>{t.revokeDescription}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmRevoke(false)} disabled={isPending}>
              {t.keepAccess}
            </Button>
            <Button
              size="sm"
              onClick={revoke}
              disabled={isPending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {t.revoke}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
