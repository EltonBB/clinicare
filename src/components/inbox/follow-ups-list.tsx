"use client";

import { useState } from "react";
import { MessageSquareText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { WorkspaceEmptyState, fieldTextareaClass } from "@/components/workspace/workspace-layout";
import {
  dismissFollowUpDraftAction,
  sendFollowUpDraftAction,
} from "@/app/(workspace)/inbox/follow-ups/actions";
import { cn } from "@/lib/utils";
import type { FollowUpDraftItem } from "@/lib/follow-ups";

type FollowUpBusyState = "send" | "skip" | null;

export function FollowUpsList({ items }: { items: FollowUpDraftItem[] }) {
  const [drafts, setDrafts] = useState(items);

  if (drafts.length === 0) {
    return <WorkspaceEmptyState icon={MessageSquareText} title="No follow-ups right now." />;
  }

  return (
    <div className="overflow-hidden rounded-(--radius-card) border border-border/80 bg-white shadow-(--shadow-card)">
      {drafts.map((draft) => (
        <FollowUpDraftRow
          key={draft.id}
          draft={draft}
          onHandled={() =>
            setDrafts((current) => current.filter((entry) => entry.id !== draft.id))
          }
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
  const [body, setBody] = useState(draft.body);
  const [busy, setBusy] = useState<FollowUpBusyState>(null);
  const [error, setError] = useState("");
  const isBusy = busy !== null;
  // reasonLabel already falls back to the kind label when no appointment is
  // linked (see buildFollowUpsViewFromRecords) — only show it separately when
  // it adds information the kind badge doesn't already say.
  const showReason = draft.reasonLabel !== draft.kindLabel;

  async function handleSend() {
    const trimmed = body.trim();

    if (!trimmed) {
      setError("Write a message before sending.");
      return;
    }

    setBusy("send");
    setError("");

    const result = await sendFollowUpDraftAction(
      draft.id,
      trimmed !== draft.body ? trimmed : undefined
    );

    if (!result.ok) {
      setError(result.error ?? "Couldn't send this message. Try again.");
      setBusy(null);
      return;
    }

    onHandled();
  }

  async function handleSkip() {
    setBusy("skip");
    setError("");

    const result = await dismissFollowUpDraftAction(draft.id);

    if (!result.ok) {
      setError(result.error ?? "We couldn't skip this follow-up.");
      setBusy(null);
      return;
    }

    onHandled();
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

      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        disabled={isBusy}
        rows={3}
        className={cn(fieldTextareaClass, "mt-2.5")}
      />

      {error ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <div className="mt-2.5 flex items-center gap-2">
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
      </div>
    </div>
  );
}
