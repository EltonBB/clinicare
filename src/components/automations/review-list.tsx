"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FilterChip, WorkspaceEmptyState, fieldTextareaClass } from "@/components/workspace/workspace-layout";
import {
  bookFollowUpSlotAction,
  dismissFollowUpDraftAction,
  passSlotOfferAction,
  sendFollowUpDraftAction,
} from "@/app/(workspace)/automations/review/actions";
import { cn, getInitials } from "@/lib/utils";
import {
  countFollowUpsByKind,
  followUpKindGroupLabels,
  followUpKindOrder,
  followUpRowKey,
  orderFollowUps,
  visibleFollowUps,
  type FollowUpDraftItem,
} from "@/lib/follow-ups";
import { WAITLIST_PLAN_ERROR } from "@/lib/waitlist";

const textButtonClass =
  "h-8 px-2 text-sm font-medium text-muted-foreground transition-colors duration-(--duration-base) hover:text-foreground disabled:opacity-60";

type FollowUpBusyState = "send" | "skip" | "book" | "pass" | null;

export function ReviewList({ items }: { items: FollowUpDraftItem[] }) {
  const router = useRouter();
  // Rows handled here disappear at once; the list itself stays driven by the
  // server so a refresh brings in anything new — skipping or declining a slot
  // offer drafts a fresh one for the next person on the waiting list, and a
  // sent slot offer comes back as a bookable row (see followUpRowKey).
  const [handledKeys, setHandledKeys] = useState<string[]>([]);
  // A handled row can still leave something to say (a send whose delivery
  // couldn't be confirmed); the row is gone by then, so the list says it.
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<FollowUpDraftItem["kind"] | "ALL">("ALL");
  const drafts = orderFollowUps(visibleFollowUps(items, handledKeys));
  const counts = countFollowUpsByKind(drafts);
  // A filter whose last row was just handled falls back to everything.
  const activeFilter = filter !== "ALL" && counts[filter] === 0 ? "ALL" : filter;
  const noticeLine = notice ? (
    <p role="alert" className="mb-2 text-xs text-destructive">
      {notice}
    </p>
  ) : null;

  if (drafts.length === 0) {
    return (
      <>
        {noticeLine}
        {/* Drafts come and go, so an empty list is usually "caught up", not a
            first run: the quiet empty state, with what lands here. */}
        <WorkspaceEmptyState
          title="Nothing to review"
          description="Messages from automations set to wait for your review land here. None of them sends until you do."
        />
      </>
    );
  }

  return (
    <>
      {noticeLine}
      <div className="mb-3 flex flex-wrap items-center gap-1">
        <FilterChip active={activeFilter === "ALL"} count={drafts.length} onClick={() => setFilter("ALL")}>
          All
        </FilterChip>
        {followUpKindOrder
          .filter((kind) => counts[kind] > 0)
          .map((kind) => (
            <FilterChip key={kind} active={activeFilter === kind} count={counts[kind]} onClick={() => setFilter(kind)}>
              {followUpKindGroupLabels[kind]}
            </FilterChip>
          ))}
      </div>
      <div className="overflow-hidden rounded-(--radius-card) border border-border/80 bg-white p-1 shadow-(--shadow-card)">
        {/* Every row stays mounted and filtered-out ones are only hidden, so an
            edit in progress survives switching chips. */}
        {drafts.map((draft) => (
          <FollowUpDraftRow
            key={followUpRowKey(draft)}
            draft={draft}
            hidden={activeFilter !== "ALL" && draft.kind !== activeFilter}
            onHandled={(handledNotice) => {
              setNotice(handledNotice ?? "");
              setHandledKeys((current) => [...current, followUpRowKey(draft)]);
              router.refresh();
            }}
          />
        ))}
      </div>
    </>
  );
}

function FollowUpDraftRow({
  draft,
  hidden,
  onHandled,
}: {
  draft: FollowUpDraftItem;
  hidden: boolean;
  onHandled: (notice?: string) => void;
}) {
  const router = useRouter();
  const [body, setBody] = useState(draft.body);
  const [busy, setBusy] = useState<FollowUpBusyState>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
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
      onHandled(result.notice);
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

  const editable = draft.canSend && !draft.canBook;

  return (
    <div
      hidden={hidden}
      className="flex gap-3 rounded-(--radius-card) p-3 transition-colors duration-(--duration-base) hover:bg-[#f7f9fc]"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-(--radius-tile) border border-border/80 bg-white text-xs font-semibold text-primary">
        {getInitials(draft.clientName)}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm">
              <span className="truncate font-semibold text-foreground">{draft.clientName}</span>
              <span className="text-xs text-muted-foreground">
                {/* A bookable offer has already gone out and waits on the patient's reply. */}
                {draft.canBook ? "Slot offer sent" : showReason ? draft.reasonLabel : draft.kindLabel}
              </span>
            </p>
            {editing ? null : (
              <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">{body}</p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {draft.canBook ? (
              <>
                {/* The patient said no: back to the waiting list, and the slot goes to the next match. */}
                <button
                  type="button"
                  onClick={() => void handlePass()}
                  disabled={isBusy}
                  aria-label={`${draft.clientName} declined the slot`}
                  className={textButtonClass}
                >
                  {busy === "pass" ? "Updating..." : "Declined"}
                </button>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 rounded-(--radius-card)"
                  onClick={() => void handleBook()}
                  disabled={isBusy}
                  aria-label={`Book the slot for ${draft.clientName}`}
                >
                  {busy === "book" ? "Booking..." : "Book"}
                </Button>
              </>
            ) : (
              <>
                {editable ? (
                  <button
                    type="button"
                    onClick={() => setEditing((current) => !current)}
                    disabled={isBusy}
                    aria-expanded={editing}
                    aria-label={`${editing ? "Done editing" : "Edit"} the message to ${draft.clientName}`}
                    className={textButtonClass}
                  >
                    {editing ? "Done" : "Edit"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleSkip()}
                  disabled={isBusy}
                  aria-label={`Skip the message to ${draft.clientName}`}
                  className={textButtonClass}
                >
                  {busy === "skip" ? "Skipping..." : "Skip"}
                </button>
                {draft.canSend ? (
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 rounded-(--radius-card)"
                    onClick={() => void handleSend()}
                    disabled={isBusy}
                    aria-label={`Send the message to ${draft.clientName}`}
                  >
                    {busy === "send" ? "Sending..." : "Send"}
                  </Button>
                ) : null}
              </>
            )}
          </div>
        </div>

        {editing ? (
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            disabled={isBusy}
            rows={3}
            autoFocus
            aria-label={`Message to ${draft.clientName}`}
            className={cn(fieldTextareaClass, "mt-2")}
          />
        ) : null}

        {!draft.canBook && !draft.canSend ? (
          <p className="mt-1.5 text-xs text-muted-foreground">{WAITLIST_PLAN_ERROR}</p>
        ) : null}

        {error ? (
          <p role="alert" className="mt-1.5 text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
