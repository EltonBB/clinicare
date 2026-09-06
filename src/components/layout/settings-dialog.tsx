"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  discardUnsavedLogoAction,
  getSettingsDataAction,
} from "@/app/(workspace)/settings/actions";
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
  // A logo SettingsWorkspace has already uploaded to Storage but not yet
  // saved. Closing here (Escape, backdrop, the confirm dialog below) never
  // mounts through SettingsWorkspace's own handleDiscard, which is the only
  // other place this same cleanup runs — so closeAndReset has to fire it
  // directly, or the upload orphans in Storage.
  const [pendingUnsavedLogoUrl, setPendingUnsavedLogoUrl] = useState<string | null>(null);
  // Neither isDirty nor pendingUnsavedLogoUrl update until the upload
  // resolves and state.business.logoUrl actually changes — so a close
  // attempt in the window while it's still running would otherwise see
  // nothing to protect and unmount this tree out from under it, orphaning
  // the upload with no cleanup ever queued (Codex P2).
  const [isLogoUploading, setIsLogoUploading] = useState(false);
  // handleSave can still be mid-flight (e.g. awaiting updateOwnerProfileAction)
  // after isLogoUploading has already gone false — without this, closing then
  // reads pendingUnsavedLogoUrl as if the save never happened, queues the
  // in-flight save's own logo for deletion, and races its saveSettingsAction
  // commit of that exact URL (Codex P2).
  const [isSaving, setIsSaving] = useState(false);

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
    if (pendingUnsavedLogoUrl) {
      // Best-effort, same as SettingsWorkspace's own handleDiscard — nothing
      // in the UI depends on it landing.
      discardUnsavedLogoAction(pendingUnsavedLogoUrl).catch(() => {});
    }

    setState(null);
    setError("");
    setIsDirty(false);
    setPendingUnsavedLogoUrl(null);
    setConfirmingDiscard(false);
    onOpenChange(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      // Refuse to close while a logo upload OR a save is still running —
      // isDirty/pendingUnsavedLogoUrl don't yet reflect either one reliably
      // (a save can be actively committing the exact logo a close-triggered
      // discard would queue for deletion), and unmounting now would either
      // orphan the upload once it resolves or race the save's own commit.
      if (isLogoUploading || isSaving) {
        return;
      }

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

  const handleUnsavedLogoUrlChange = useCallback((url: string | null) => {
    setPendingUnsavedLogoUrl(url);
  }, []);

  const handleLogoUploadingChange = useCallback((uploading: boolean) => {
    setIsLogoUploading(uploading);
  }, []);

  const handleSavingChange = useCallback((saving: boolean) => {
    setIsSaving(saving);
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
            onSaved={(stillDirty) => {
              // Not always false — a save can preserve a newer in-flight
              // account edit that's still genuinely unsaved (see handleSave
              // in settings-workspace.tsx), and Escape/backdrop-close needs
              // to still guard that with the discard confirmation.
              setIsDirty(stillDirty);
              router.refresh();
            }}
            onDirtyChange={handleDirtyChange}
            onUnsavedLogoUrlChange={handleUnsavedLogoUrlChange}
            onLogoUploadingChange={handleLogoUploadingChange}
            onSavingChange={handleSavingChange}
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
