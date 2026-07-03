"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { getSettingsDataAction } from "@/app/(workspace)/settings/actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDeleteDialog } from "@/components/clients/record-form-dialog";
import type { SettingsState } from "@/lib/settings";

// Loaded on demand so the settings workspace (and its heavy dependencies)
// stays out of the shared layout bundle for every workspace page.
const SettingsWorkspace = dynamic(
  () =>
    import("@/components/settings/settings-workspace").then(
      (mod) => mod.SettingsWorkspace
    ),
  { ssr: false }
);

export function SettingsDialog({
  open,
  onOpenChange,
  ownerName = "",
  ownerEmail = "",
  ownerPhone = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ownerName?: string;
  ownerEmail?: string;
  ownerPhone?: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<SettingsState | null>(null);
  const [error, setError] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const data = await getSettingsDataAction();
        if (!cancelled) {
          setState(data);
          setError("");
        }
      } catch {
        if (!cancelled) {
          setError("We couldn't load settings right now. Try again in a moment.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  // Reset to the loading state when the dialog closes so the next open always
  // reflects current server state, never a stale snapshot.
  function closeAndReset() {
    setState(null);
    setError("");
    setIsDirty(false);
    setConfirmingDiscard(false);
    onOpenChange(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      // Guard against losing in-progress edits to an accidental Esc/backdrop
      // close — ask instead of silently discarding.
      if (isDirty) {
        setConfirmingDiscard(true);
        return;
      }

      closeAndReset();
      return;
    }
    onOpenChange(next);
  }

  const handleDirtyChange = useCallback((dirty: boolean) => {
    setIsDirty(dirty);
  }, []);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[88vh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[920px]">
        <DialogHeader className="shrink-0 border-b border-border/70 px-5 py-4">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Configure how the workspace runs.</DialogDescription>
        </DialogHeader>
        {state ? (
          <SettingsWorkspace
            variant="dialog"
            initialState={state}
            ownerName={ownerName}
            ownerEmail={ownerEmail}
            ownerPhone={ownerPhone}
            onSaved={() => {
              setIsDirty(false);
              router.refresh();
            }}
            onDirtyChange={handleDirtyChange}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center px-5 py-16 text-sm text-muted-foreground">
            {error ? (
              <p className="text-destructive">{error}</p>
            ) : (
              <span className="inline-flex items-center gap-2">
                <span className="size-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                Loading settings…
              </span>
            )}
          </div>
        )}
      </DialogContent>

      <ConfirmDeleteDialog
        open={confirmingDiscard}
        onOpenChange={setConfirmingDiscard}
        title="Discard unsaved changes?"
        description="Your edits to settings haven't been saved. Closing now will lose them."
        confirmLabel="Discard"
        isPending={false}
        onConfirm={closeAndReset}
      />
    </Dialog>
  );
}
