"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquareText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { WorkspaceEmptyState, fieldTextareaClass } from "@/components/workspace/workspace-layout";
import {
  bookFollowUpSlotAction,
  dismissFollowUpDraftAction,
  passSlotOfferAction,
  sendFollowUpDraftAction,
} from "@/app/(workspace)/inbox/follow-ups/actions";
import { cn } from "@/lib/utils";
import { followUpRowKey, visibleFollowUps, type FollowUpDraftItem } from "@/lib/follow-ups";

type FollowUpBusyState = "send" | "skip" | "book" | "pass" | null;

export function FollowUpsList({ items }: { items: FollowUpDraftItem[] }) {
  const router = useRouter();
  // Rows handled here disappear at once; the list itself stays driven by the
  // server so a refresh brings in anything new — skipping or declining a slot
  // offer drafts a fresh one for the next person on the waiting list, and a
  // sent slot offer comes back as a bookable row (see followUpRowKey).
  const [handledKeys, setHandledKeys] = useState<string[]>([]);
  const drafts = visibleFollowUps(items, handledKeys);

  if (drafts.length === 0) {
    return <WorkspaceEmptyState icon={MessageSquareText} title="No follow-ups right now." />;
  }

  return (
    <div className="overflow-hidden rounded-(--radius-card) border border-border/80 bg-white shadow-(--shadow-card)">
      {drafts.map((draft) => (
        <FollowUpDraftRow
          key={followUpRowKey(draft)}
          draft={draft}
          onHandled={() => {
            setHandledKeys((current) => [...current, followUpRowKey(draft)]);
            router.refresh();
          }}
        />
      ))}
    </div>
  );
}

function FollowUpDraftRow({
  draft,
  onHandled,
}: {
  draft: FollowUpDraftItem;
  onHandled: () => void;
}) {
  const router = useRouter();
  const [body, setBody] = useState(draft.body);
  const [busy, setBusy] = useState<FollowUpBusyState>(null);
  const [error, setError] = useState("");
  const isBusy = busy !== null;
  // reasonLabel already falls back to the kind label when no appointment is
  // linked (see buildFollowUpsViewFromRecords) — only show it separately when
  // it adds information the kind badge doesn't already say.
  const showReason = draft.reasonLabel !== draft.kindLabel;

  /**
   * Runs one row action: shows its busy state, turns a refused or thrown action
   * into a plain message (never the raw error) and re-enables the buttons, and
   * returns the result only when it succeeded (null when the failure was shown).
   */
  async function run<T extends { ok: boolean; error?: string }>(
    kind: Exclude<FollowUpBusyState, null>,
    call: () => Promise<T>,
    fallbackError: string
  ): Promise<T | null> {
    setBusy(kind);
    setError("");

    let result: T;
    try {
      result = await call();
    } catch {
      // A rejected server action (network drop, 5xx, deploy skew) — a plain
      // message, and the buttons come back instead of staying stuck disabled.
      setError("Something went wrong. Try again.");
      setBusy(null);
      return null;
    }

    if (!result.ok) {
      setError(result.error ?? fallbackError);
      setBusy(null);
      return null;
    }

    return result;
  }

  async function handleSend() {
    const trimmed = body.trim();

    if (!trimmed) {
      setError("Write a message before sending.");
      return;
    }

    const result = await run(
      "send",
      () => sendFollowUpDraftAction(draft.id, trimmed !== draft.body ? trimmed : undefined),
      "Couldn't send this message. Try again."
    );

    if (result) {
      onHandled();
    }
  }

  async function handleSkip() {
    if (await run("skip", () => dismissFollowUpDraftAction(draft.id), "We couldn't skip this follow-up.")) {
      onHandled();
    }
  }

  async function handleBook() {
    const result = await run(
      "book",
      () => bookFollowUpSlotAction(draft.id),
      "This slot offer is no longer available."
    );

    if (result?.ok) {
      router.push(result.bookingUrl);
    }
  }

  async function handlePass() {
    if (await run("pass", () => passSlotOfferAction(draft.id), "This slot offer is no longer available.")) {
      onHandled();
    }
  }

  return (
    <div className="p-3.5 transition-colors duration-(--duration-base) hover:bg-[#fbfcfe]">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <p className="truncate text-sm font-semibold text-foreground">{draft.clientName}</p>
        <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {draft.kindLabel}
        </span>
      </div>
      {showReason ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{draft.reasonLabel}</p>
      ) : null}

      {draft.canBook ? (
        // Already sent — read-only, since there's nothing left to edit-and-send.
        <p className="mt-2.5 text-sm text-foreground">{draft.body}</p>
      ) : (
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          disabled={isBusy}
          rows={3}
          className={cn(fieldTextareaClass, "mt-2.5")}
        />
      )}

      {error ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <div className="mt-2.5 flex items-center gap-2">
        {draft.canBook ? (
          <>
            <Button
              type="button"
              size="sm"
              className="h-9 rounded-(--radius-card)"
              onClick={() => void handleBook()}
              disabled={isBusy}
            >
              {busy === "book" ? "Booking..." : "Book"}
            </Button>
            {/* The patient said no: back to the waiting list, and the slot goes to the next match. */}
            <button
              type="button"
              onClick={() => void handlePass()}
              disabled={isBusy}
              className="h-9 px-2 text-sm font-medium text-muted-foreground transition-colors duration-(--duration-base) hover:text-foreground disabled:opacity-60"
            >
              {busy === "pass" ? "Updating..." : "Declined"}
            </button>
          </>
        ) : (
          <>
            <Button
              type="button"
              size="sm"
              className="h-9 rounded-(--radius-card)"
              onClick={() => void handleSend()}
              disabled={isBusy}
            >
              {busy === "send" ? "Sending..." : "Send"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-(--radius-card) bg-white"
              onClick={() => void handleSkip()}
              disabled={isBusy}
            >
              {busy === "skip" ? "Skipping..." : "Skip"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
