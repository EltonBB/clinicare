"use client";

import Link from "next/link";
import {
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { m as motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRightLeft,
  ExternalLink,
  Search,
  SendHorizontal,
  Trash2,
} from "lucide-react";

import {
  convertConversationToClientAction,
  deleteConversationAction,
  hydrateConversationAction,
  markConversationReadAction,
  recordConversationViewAction,
  refreshInboxAction,
  sendInboxMessageAction,
} from "@/app/(workspace)/inbox/actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/components/clients/record-form-dialog";
import { Input } from "@/components/ui/input";
import {
  FilterChip,
  WorkspaceEmptyState,
  WorkspaceFirstRun,
  WorkspaceHeader,
  WorkspacePage,
  searchFieldClass,
} from "@/components/workspace/workspace-layout";
import { useI18n, useServerText } from "@/i18n/client";
import { fmt } from "@/i18n/format";
import { cn, getInitials } from "@/lib/utils";
import { fadeIn } from "@/lib/motion";
import { LazyMotionProvider } from "@/components/layout/motion-provider";
import { fillViewportRef } from "@/hooks/fill-viewport";
import type { InboxViewModel } from "@/lib/inbox";
import type { SettingsState } from "@/lib/settings";

type InboxWorkspaceProps = {
  initialView: InboxViewModel;
  ownerName: string;
  connection: SettingsState["whatsapp"]["connection"];
  clientCount: number;
  recommendedClientId?: string;
  /** A deep link (?conversation= / ?client=) named the chat, so phones open on it rather than the list. */
  openOnThread?: boolean;
};

type InboxFilter = "all" | "unread";

// From lg the list and the open chat sit side by side.
const SIDE_BY_SIDE_QUERY = "(min-width: 1024px)";

function subscribeToSideBySide(notify: () => void) {
  const query = window.matchMedia(SIDE_BY_SIDE_QUERY);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}

function isReminderMessage(body: string) {
  const normalized = body.toLowerCase();
  return (
    normalized.includes("this is a reminder for your appointment") ||
    normalized.includes("appointment is coming up") ||
    // The Albanian default reminder (lib/automations).
    normalized.includes("ju kujtojmë terminin tuaj") ||
    normalized.startsWith("reminder:")
  );
}

function deliveryTone(status?: SettingsState["whatsapp"]["connection"]["status"] | InboxViewModel["conversations"][number]["messages"][number]["deliveryStatus"]) {
  if (status === "read" || status === "delivered" || status === "CONNECTED") {
    return "bg-white/18 text-primary-foreground";
  }

  if (status === "failed" || status === "ERRORED") {
    return "bg-destructive/14 text-destructive";
  }

  return "bg-white/14 text-primary-foreground/85";
}

// A failed preview hydration (openConversation's lazy fetch for an "extra"
// unread conversation) retries this many times, spaced this far apart,
// before leaving the operator to recover by reselecting the conversation
// themselves — bounded so a persistent failure (not a transient blip)
// doesn't retry forever.
const MAX_HYDRATION_RETRIES = 3;
const HYDRATION_RETRY_DELAY_MS = 5000;

// The unread count sitting on conversations beyond the loaded page (older,
// not recently updated) — the server's business-wide total minus what the
// loaded conversations already account for.
function hiddenUnreadCountFrom(view: Pick<InboxViewModel, "conversations" | "totalUnreadCount">) {
  return Math.max(
    view.totalUnreadCount -
      view.conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0),
    0
  );
}

// A conversation already hydrated to full history locally must not be
// clobbered back down to a 1-message preview by a poll response that
// hasn't caught up yet — e.g. a mark-read that would promote it into the
// recency-capped "recent" bucket hasn't committed server-side by the time
// this poll ran. But if the preview's message isn't one we already have,
// our local snapshot is stale (a new reply arrived while this conversation
// stayed outside the recent window) — fall back to the preview's own
// shape rather than hand-splicing a merged list, so the hydration effect
// re-fetches the real full thread if this becomes the active conversation.
function mergeHydratedPreview(
  existing: InboxViewModel["conversations"][number] | undefined,
  incoming: InboxViewModel["conversations"][number]
): InboxViewModel["conversations"][number] {
  if (!existing?.hasFullHistory || incoming.hasFullHistory) {
    return incoming;
  }

  const incomingLatest = incoming.messages[0];
  const existingLatest = existing.messages[existing.messages.length - 1];

  if (incomingLatest && incomingLatest.id !== existingLatest?.id) {
    return incoming;
  }

  return { ...incoming, hasFullHistory: true, messages: existing.messages };
}

export function InboxWorkspace({
  initialView,
  ownerName,
  connection,
  clientCount,
  recommendedClientId,
  openOnThread = false,
}: InboxWorkspaceProps) {
  const { m } = useI18n();
  const t = m.inbox;
  const serverText = useServerText();
  const [conversations, setConversations] = useState(initialView.conversations);
  const [selectedConversationId, setSelectedConversationId] = useState(
    initialView.initialConversationId
  );
  // Below lg the list and the open chat don't fit side by side, so one shows
  // at a time: the list until a chat is opened, then the chat with a way back.
  const [threadOpenOnSmallScreens, setThreadOpenOnSmallScreens] = useState(openOnThread);
  // False until the browser says otherwise (the server can't know the
  // screen), so a phone never logs the chat hidden behind its list as viewed.
  const sideBySide = useSyncExternalStore(
    subscribeToSideBySide,
    () => window.matchMedia(SIDE_BY_SIDE_QUERY).matches,
    () => false
  );
  const chatOnScreen = sideBySide || threadOpenOnSmallScreens;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [draftMessage, setDraftMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [convertName, setConvertName] = useState("");
  const [convertEmail, setConvertEmail] = useState("");
  const [isPending, startTransition] = useTransition();
  const deferredQuery = useDeferredValue(query);
  const unreadTotal = conversations.reduce(
    (sum, conversation) => sum + conversation.unreadCount,
    0
  );
  // Re-synced on each successful poll below (see the refreshInbox effect).
  // unreadTotal above stays live between polls so the chip still decrements
  // immediately when the operator reads a loaded conversation, instead of
  // waiting on the poll.
  const [hiddenUnreadCount, setHiddenUnreadCount] = useState(() =>
    hiddenUnreadCountFrom(initialView)
  );
  const displayedUnreadTotal = unreadTotal + hiddenUnreadCount;

  const filteredConversations = useMemo(() => {
    const normalized = deferredQuery.trim().toLowerCase();

    return conversations.filter((conversation) => {
      if (filter === "unread" && conversation.unreadCount === 0) {
        return false;
      }

      if (!normalized) {
        return true;
      }

      return [conversation.clientName, conversation.preview, conversation.phone].some((value) =>
        value.toLowerCase().includes(normalized)
      );
    });
  }, [conversations, deferredQuery, filter]);

  const activeConversation =
    filteredConversations.find(
      (conversation) => conversation.id === selectedConversationId
    ) ??
    filteredConversations[0] ??
    conversations.find((conversation) => conversation.id === selectedConversationId);
  // Looked up against the unfiltered list (not activeConversation, which can
  // fall through to a different row when the search/unread filter hides the
  // actual selection) and read as a plain boolean rather than depending on
  // `conversations` itself — so a poll tick that leaves this specific value
  // unchanged doesn't restart an in-flight hydration below.
  const selectedConversationHasFullHistory =
    conversations.find((conversation) => conversation.id === selectedConversationId)
      ?.hasFullHistory ?? true;
  const hasClients = clientCount > 0;
  const bookingHref = recommendedClientId
    ? `/calendar/new?client=${recommendedClientId}`
    : "/calendar/new";
  const connectionLine = m.common.whatsappPhase[connection.phase];

  // Conversations the operator opened this session (marked read optimistically).
  // The 10s poll replaces the whole list from the DB; without this, a poll that
  // resolves before the async mark-read commits would flip a just-opened thread
  // back to "unread" for up to a cycle. We keep overriding it to read until the
  // server itself reports 0, then stop (so a genuine later reply still shows).
  const locallyReadIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    async function refreshInbox() {
      if (document.visibilityState !== "visible") {
        return;
      }

      // A failed poll (offline, a redeploy) is skipped; the next tick retries.
      const result = await refreshInboxAction().catch(() => null);

      if (!result?.ok || !result.view || cancelled) {
        return;
      }

      setConversations((current) => {
        const currentById = new Map(
          current.map((conversation) => [conversation.id, conversation])
        );

        return result.view!.conversations.map((conversation) => {
          const merged = mergeHydratedPreview(currentById.get(conversation.id), conversation);

          if (!locallyReadIdsRef.current.has(merged.id)) {
            return merged;
          }
          if (merged.unreadCount === 0) {
            // The read committed server-side — stop overriding this thread.
            locallyReadIdsRef.current.delete(merged.id);
            return merged;
          }
          return { ...merged, unreadCount: 0 };
        });
      });
      // From the raw server values (before the locally-read override above),
      // so a pending optimistic mark-as-read on a loaded conversation never
      // throws this off.
      setHiddenUnreadCount(hiddenUnreadCountFrom(result.view));
      setSelectedConversationId((current) => {
        if (
          current &&
          result.view!.conversations.some((conversation) => conversation.id === current)
        ) {
          return current;
        }

        return result.view!.initialConversationId;
      });
    }

    // Poll while the tab is visible, AND refresh the moment the operator returns
    // to the tab so a reply that arrived while it was backgrounded shows at once
    // instead of waiting for the next interval tick.
    const interval = window.setInterval(() => {
      void refreshInbox();
    }, 10000);

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void refreshInbox();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Jumps the thread to the newest message on every conversation switch, and
  // whenever the active thread grows — but only if the operator was already
  // near the bottom, so a reply landing via the 10s poll doesn't yank them
  // away mid-scroll while they're rereading earlier messages. The container's
  // DOM node itself is recreated on switch (see the m.div's
  // key={activeConversation.id} below), so this runs against the fresh node.
  const messageListRef = useRef<HTMLDivElement>(null);
  const wasNearBottomRef = useRef(true);
  const previousConversationIdRef = useRef<string | undefined>(undefined);
  // A chat mounted while hidden (a phone showing just the list) was "scrolled"
  // at zero height, so it scrolls again once it actually comes on screen.
  const wasOnScreenRef = useRef(chatOnScreen);
  // Set right before sendMessage's own state update lands, so the operator
  // always sees their own message appear even if they'd scrolled up to
  // reread history — unlike an incoming poll reply, a local send should
  // never be silently left off-screen.
  const justSentRef = useRef(false);
  // Bumped alongside justSentRef so the autoscroll effect below always
  // re-runs after a send completes — if the 10s poll already delivered the
  // identical message first, id/newestMessageId/messageCount wouldn't
  // change a second time on their own, and the effect would never see
  // justSentRef flip to true (Codex).
  const [sendRevision, setSendRevision] = useState(0);

  function handleMessageListScroll() {
    const container = messageListRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    wasNearBottomRef.current = distanceFromBottom < 120;
  }

  // The server caps a conversation at RECENT_MESSAGE_LIMIT messages, so once
  // a thread is already at that cap, a new incoming message evicts the
  // oldest one instead of growing the array — messages.length alone would
  // miss that change and skip the scroll. The newest message's own id
  // catches it either way.
  const newestMessageId = activeConversation?.messages.at(-1)?.id;
  // Hydration (below) replaces a 1-message preview with the full thread —
  // the newest id is unchanged (the preview already showed it), so without
  // this the effect wouldn't re-run and scrollTop would stay pinned to the
  // preview's tiny scrollHeight, stranding the view above the real content.
  const messageCount = activeConversation?.messages.length ?? 0;

  // Layout, not passive — runs before paint so a freshly-mounted long thread
  // never flashes its top for a frame before snapping to the bottom.
  useLayoutEffect(() => {
    const container = messageListRef.current;
    if (!container) return;
    const isNewConversation = previousConversationIdRef.current !== activeConversation?.id;
    previousConversationIdRef.current = activeConversation?.id;
    const justShown = chatOnScreen && !wasOnScreenRef.current;
    wasOnScreenRef.current = chatOnScreen;
    if (isNewConversation || justShown || wasNearBottomRef.current || justSentRef.current) {
      container.scrollTop = container.scrollHeight;
      wasNearBottomRef.current = true;
      justSentRef.current = false;
    }
  }, [activeConversation?.id, newestMessageId, messageCount, sendRevision, chatOnScreen]);

  // Fresh retry budget each time a different conversation is selected —
  // independent of the retry-token effect below, which bumps within the
  // same selection.
  const hydrationRetryCountRef = useRef(0);
  useEffect(() => {
    hydrationRetryCountRef.current = 0;
  }, [selectedConversationId]);

  // Bumped by a failed hydration attempt below to trigger a bounded retry —
  // an otherwise-inert dependency of the effect below.
  const [hydrationRetryToken, setHydrationRetryToken] = useState(0);

  // One audit entry per chat shown (any way it comes on screen). Fire and
  // forget: the log never holds up reading the chat.
  // Keyed to the chat actually on screen, which a search or the Unread filter
  // can switch to another row without changing the selection. On a small
  // screen showing just the list, no chat is on screen.
  const displayedConversationId = chatOnScreen ? activeConversation?.id : undefined;
  useEffect(() => {
    if (displayedConversationId) void recordConversationViewAction(displayedConversationId).catch(() => {});
  }, [displayedConversationId]);

  // Hydrates the selected conversation's full thread whenever it's only a
  // 1-message preview (hasFullHistory: false) — covers every way a
  // conversation becomes selected: a sidebar click, the initial load, or a
  // deep link (?conversation=/?client=) landing straight on an old, unread
  // conversation the recency cap left out.
  useEffect(() => {
    if (!selectedConversationId) {
      return;
    }

    if (selectedConversationHasFullHistory) {
      // The conversation can gain full history either from this effect's own
      // hydrate succeeding below, or from the ordinary "recent" poll picking
      // it up on its own (e.g. a fresh reply bumped its updatedAt back into
      // the recency window) — either way, a stale hydration-failure error no
      // longer applies.
      setErrorMessage("");
      return;
    }

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    function scheduleRetry() {
      if (hydrationRetryCountRef.current >= MAX_HYDRATION_RETRIES) {
        return;
      }
      hydrationRetryCountRef.current += 1;
      retryTimer = setTimeout(() => {
        if (!cancelled) {
          setHydrationRetryToken((token) => token + 1);
        }
      }, HYDRATION_RETRY_DELAY_MS);
    }

    hydrateConversationAction(selectedConversationId)
      .then((result) => {
        if (cancelled) {
          return;
        }

        if (!result.ok || !result.conversation) {
          setErrorMessage(serverText(result.error) ?? t.errors.loadHistory);
          scheduleRetry();
          return;
        }

        const hydrated = result.conversation;
        // Clear immediately on this success, rather than only relying on the
        // early-return branch above catching it a render later (it still
        // does, for the case where a poll — not this fetch — is what
        // actually resolves hasFullHistory to true).
        setErrorMessage("");
        // unreadCount deliberately comes from local state, not the hydrate
        // fetch — the optimistic zero on open (or a concurrent mark-read
        // commit) is more current than whatever this read saw.
        setConversations((current) =>
          current.map((conversation) => {
            if (conversation.id !== selectedConversationId) {
              return conversation;
            }
            if (conversation.hasFullHistory) {
              // Something else (a send, a convert, or a poll promotion)
              // already delivered fresher full data — don't stomp it with
              // this possibly-older read.
              return conversation;
            }
            return { ...hydrated, unreadCount: conversation.unreadCount };
          })
        );
      })
      .catch(() => {
        if (!cancelled) {
          setErrorMessage(t.errors.loadHistory);
          scheduleRetry();
        }
      });

    return () => {
      cancelled = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }, [selectedConversationId, selectedConversationHasFullHistory, hydrationRetryToken, serverText, t.errors.loadHistory]);

  function openConversation(conversationId: string) {
    setSelectedConversationId(conversationId);
    setThreadOpenOnSmallScreens(true);
    locallyReadIdsRef.current.add(conversationId);
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, unreadCount: 0 }
          : conversation
      )
    );

    // Hydrating a truncated preview (hasFullHistory: false) is handled by the
    // effect above, keyed on selectedConversationId — it fires for this click
    // and for any other way a conversation becomes selected (initial load,
    // a deep link), so it isn't duplicated here.

    startTransition(async () => {
      try {
        const result = await markConversationReadAction(conversationId);

        if (!result.ok) {
          setErrorMessage(serverText(result.error) ?? t.errors.open);
          return;
        }

        setErrorMessage("");
      } finally {
        // The override only needs to bridge the window until mark-read resolves.
        // Clearing it here (on success OR failure) stops it from outliving the
        // race: otherwise a genuine reply arriving after the read committed would
        // be force-masked to 0 forever, since the server never reports 0 again.
        locallyReadIdsRef.current.delete(conversationId);
      }
    });
  }

  function openConvertDialog() {
    if (!activeConversation) {
      return;
    }

    setConvertName(
      activeConversation.displayName === t.view.unregistered
        ? ""
        : activeConversation.displayName
    );
    setConvertEmail("");
    setConvertDialogOpen(true);
  }

  function removeConversationFromList(conversationId: string) {
    setConversations((current) => {
      const nextConversations = current.filter(
        (conversation) => conversation.id !== conversationId
      );
      setSelectedConversationId(nextConversations[0]?.id ?? "");
      return nextConversations;
    });
  }

  function sendMessage() {
    const body = draftMessage.trim();

    if (!body || !activeConversation) {
      return;
    }
    const activeConversationId = activeConversation.id;

    startTransition(async () => {
      const result = await sendInboxMessageAction(activeConversationId, body);

      if (!result.ok) {
        setErrorMessage(serverText(result.error) ?? t.errors.send);
        return;
      }

      // Sent, but the thread was deleted in another tab before it could be
      // reloaded: keep the send (clear the draft so it isn't sent twice) and
      // drop the thread here too.
      if (!result.conversation) {
        removeConversationFromList(activeConversationId);
        setDraftMessage("");
        setErrorMessage(t.errors.sentButDeleted);
        return;
      }

      justSentRef.current = true;
      setSendRevision((current) => current + 1);
      setConversations((current) => [
        result.conversation!,
        ...current.filter((conversation) => conversation.id !== result.conversation!.id),
      ]);
      setSelectedConversationId(result.conversation.id);
      setDraftMessage("");
      setErrorMessage("");
    });
  }

  function deleteConversation(conversationId: string) {
    startTransition(async () => {
      const result = await deleteConversationAction(conversationId);

      if (!result.ok) {
        setConfirmingDeleteId(null);
        setErrorMessage(serverText(result.error) ?? t.errors.delete);
        return;
      }

      removeConversationFromList(conversationId);
      setConfirmingDeleteId(null);
      // The chat that was open is gone: small screens go back to the list.
      setThreadOpenOnSmallScreens(false);
      setDraftMessage("");
      setErrorMessage("");
    });
  }

  function convertConversationToClient() {
    if (!activeConversation) {
      return;
    }

    startTransition(async () => {
      const result = await convertConversationToClientAction(activeConversation.id, {
        name: convertName,
        email: convertEmail,
      });

      if (!result.ok) {
        setErrorMessage(serverText(result.error) ?? t.errors.convert);
        return;
      }

      setConvertDialogOpen(false);
      setConvertName("");
      setConvertEmail("");

      // The client was saved, but the thread was deleted in another tab before
      // it could be reloaded.
      if (!result.conversation) {
        removeConversationFromList(activeConversation.id);
        setErrorMessage(t.errors.savedButDeleted);
        return;
      }

      setConversations((current) => [
        result.conversation!,
        ...current.filter((conversation) => conversation.id !== result.conversation!.id),
      ]);
      setSelectedConversationId(result.conversation.id);
      setErrorMessage("");
    });
  }

  return (
    <LazyMotionProvider>
      <Dialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen}>
        <DialogContent className="max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="text-[1.1rem] font-semibold">{t.convert.title}</DialogTitle>
            <DialogDescription className="text-sm leading-6">{t.convert.description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">{t.convert.phone}</p>
              <p className="text-sm font-medium text-foreground">{activeConversation?.phone}</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t.convert.name}</label>
              <Input
                value={convertName}
                onChange={(event) => setConvertName(event.target.value)}
                placeholder={t.convert.namePlaceholder}
                className="h-10 rounded-(--radius-card) bg-white"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t.convert.email}</label>
              <Input
                value={convertEmail}
                onChange={(event) => setConvertEmail(event.target.value)}
                placeholder={t.convert.emailPlaceholder}
                className="h-10 rounded-(--radius-card) bg-white"
              />
            </div>
          </div>

          <DialogFooter className="items-stretch gap-2 sm:flex-col sm:items-stretch sm:justify-start">
            <Button
              className="h-10 w-full rounded-(--radius-field)"
              onClick={convertConversationToClient}
              disabled={isPending}
            >
              {isPending ? t.convert.converting : t.convert.title}
            </Button>
            <p className="text-xs font-medium leading-5 text-muted-foreground">{t.convert.keepsHistory}</p>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={confirmingDeleteId !== null}
        onOpenChange={(open) => setConfirmingDeleteId(open ? confirmingDeleteId : null)}
        title={t.deleteTitle}
        description={t.deleteDescription}
        isPending={isPending}
        onConfirm={() => {
          if (confirmingDeleteId) deleteConversation(confirmingDeleteId);
        }}
      />

      <WorkspacePage size="wide">
        <WorkspaceHeader title={t.title} />

        {/* Fills the rest of the screen, measured from where it starts (see
            fillViewportRef), so the composer stays on screen on a short laptop
            and under a banner; below lg the fixed bottom nav is left clear. */}
        <div
          ref={fillViewportRef}
          className={cn(
            "surface-card h-[calc(100dvh_-_var(--fill-top,174px)_-_7rem)] min-h-[420px] overflow-hidden p-0 lg:h-[calc(100dvh_-_var(--fill-top,174px)_-_1rem)] lg:min-h-[440px]",
            // No chats yet: no thread or composer to keep on screen, so on
            // phones the card grows with the first-run list instead of
            // squeezing it into a scroll box.
            conversations.length === 0 && "max-lg:h-auto"
          )}
        >
          {/* grid-rows-[minmax(0,1fr)]: the card's height is fixed, but a
              grid's single implicit row is content-sized, so both panes grew to
              their full height and the card clipped them; their own scroll areas
              never engaged and long threads couldn't be scrolled (owner, 2026-10-18). */}
          <div className="grid h-full grid-cols-1 grid-rows-[minmax(0,1fr)] lg:grid-cols-[320px_minmax(0,1fr)]">
            <aside
              className={cn(
                "flex min-h-0 flex-col lg:border-r lg:border-border/80",
                threadOpenOnSmallScreens && activeConversation && "max-lg:hidden"
              )}
            >
              <div className="space-y-2.5 px-3.5 pb-3 pt-3.5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t.search}
                    className={searchFieldClass}
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <FilterChip
                    shape="pill"
                    active={filter === "all"}
                    count={conversations.length}
                    onClick={() => setFilter("all")}
                  >
                    {t.all}
                  </FilterChip>
                  <FilterChip
                    shape="pill"
                    active={filter === "unread"}
                    count={displayedUnreadTotal}
                    onClick={() => setFilter("unread")}
                  >
                    {t.unread}
                  </FilterChip>
                </div>
                <p className="truncate text-xs text-muted-foreground">{connectionLine}</p>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {errorMessage ? (
                  <div className="px-3.5 py-3">
                    <div className="rounded-(--radius-card) border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                      {errorMessage}
                    </div>
                  </div>
                ) : null}
                {filteredConversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => openConversation(conversation.id)}
                    className={cn(
                      "relative flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors duration-(--duration-base) hover:bg-[#f7f9fc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30",
                      activeConversation?.id === conversation.id &&
                        "bg-primary/8 before:absolute before:inset-y-3 before:left-0 before:w-[3px] before:rounded-r-full before:bg-primary"
                    )}
                  >
                    <Avatar size="lg" shape="square">
                      <AvatarFallback className="bg-white text-xs font-semibold text-primary">
                        {getInitials(conversation.clientName)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {conversation.displayName}
                        </p>
                        <p className="shrink-0 text-xs text-muted-foreground">
                          {conversation.lastMessageAt}
                        </p>
                      </div>
                      {!conversation.isLinkedClient ? (
                        <p className="mt-0.5 text-xs font-medium text-primary">
                          {conversation.contactStatusLabel}
                        </p>
                      ) : null}
                      {conversation.preview ? (
                        <p className="mt-0.5 truncate text-sm text-muted-foreground">
                          {conversation.preview}
                        </p>
                      ) : null}
                    </div>

                    {conversation.unreadCount > 0 ? (
                      <span className="mt-0.5 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                        {conversation.unreadCount}
                      </span>
                    ) : null}
                  </button>
                ))}
                {conversations.length === 0 ? (
                  // First run: nothing has arrived yet, so there is nothing to
                  // search or filter. Side by side, the thread pane carries the
                  // one action; below lg that pane is hidden, so it is here.
                  <WorkspaceFirstRun
                    cells={["identity"]}
                    rows={5}
                    className="pt-2"
                    title={t.firstRunTitle}
                    description={t.firstRunCopy}
                    actionHref={hasClients ? bookingHref : "/clients/new?next=calendar"}
                    actionLabel={hasClients ? t.bookAppointment : t.addClient}
                    actionClassName="lg:hidden"
                  />
                ) : filteredConversations.length === 0 ? (
                  <div className="px-4 py-6">
                    <WorkspaceEmptyState
                      icon={Search}
                      title={t.noneFound}
                      description={filter === "unread" ? t.allRead : t.tryAnotherSearch}
                      compact
                    />
                  </div>
                ) : null}
              </div>
            </aside>

            <section
              className={cn(
                "flex min-h-0 min-w-0 flex-col bg-white/92",
                !(threadOpenOnSmallScreens && activeConversation) && "max-lg:hidden"
              )}
            >
              {activeConversation ? (
                <motion.div
                  key={activeConversation.id}
                  variants={fadeIn}
                  initial="initial"
                  animate="animate"
                  className="flex min-h-0 flex-1 flex-col"
                >
                  <div className="flex items-center justify-between gap-3.5 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setThreadOpenOnSmallScreens(false)}
                        aria-label={t.backToConversations}
                        className="-ml-1.5 flex size-9 shrink-0 items-center justify-center rounded-(--radius-tile) text-muted-foreground transition-colors duration-(--duration-base) hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 lg:hidden"
                      >
                        <ArrowLeft className="size-4" />
                      </button>
                      <Avatar size="lg" shape="square">
                        <AvatarFallback className="bg-white text-xs font-semibold text-primary">
                          {getInitials(activeConversation.clientName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-foreground">
                          {activeConversation.displayName}
                        </p>
                        <p className="truncate text-sm text-muted-foreground">
                          {activeConversation.phone}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {activeConversation.clientId ? (
                        <Link
                          href={`/clients/${activeConversation.clientId}`}
                          className={cn(
                            buttonVariants({ variant: "outline", size: "sm" }),
                            "h-9 rounded-(--radius-card) bg-white"
                          )}
                        >
                          {t.viewProfile}
                          <ExternalLink className="size-3.5" />
                        </Link>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9 rounded-(--radius-card) bg-white"
                          onClick={openConvertDialog}
                          disabled={isPending}
                        >
                          <ArrowRightLeft className="size-3.5" />
                          {t.convertToClient}
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="size-9 rounded-(--radius-card) border-border/80 bg-white px-0 text-muted-foreground hover:border-destructive/30 hover:bg-destructive/5 hover:text-destructive"
                        onClick={() => setConfirmingDeleteId(activeConversation.id)}
                        disabled={isPending}
                        aria-label={t.deleteConversation}
                        title={t.deleteConversation}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Below lg the list (where errors normally show) is hidden
                      while a chat is open, so a failed send or delete says so here. */}
                  {errorMessage ? (
                    <div className="px-4 pb-2 lg:hidden">
                      <div className="rounded-(--radius-card) border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                        {errorMessage}
                      </div>
                    </div>
                  ) : null}

                  <div
                    ref={messageListRef}
                    onScroll={handleMessageListScroll}
                    className="flex-1 overflow-y-auto bg-muted/22 px-4 py-4"
                  >
                    <div className="mx-auto max-w-3xl space-y-2.5">
                      {activeConversation.messages.map((message, index) => {
                        const previousMessage = activeConversation.messages[index - 1];
                        const showDaySeparator =
                          !previousMessage || previousMessage.dayLabel !== message.dayLabel;

                        return (
                          <div key={message.id}>
                            {showDaySeparator ? (
                              <div className="flex items-center gap-3 py-2">
                                <span className="h-px flex-1 bg-border/60" />
                                <span className="text-[11px] font-medium text-muted-foreground">
                                  {message.dayLabel}
                                </span>
                                <span className="h-px flex-1 bg-border/60" />
                              </div>
                            ) : null}
                            {message.sender === "system" ? (
                              <div className="mx-auto w-fit rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">
                                {message.body}
                              </div>
                            ) : (
                              <div
                                className={cn(
                                  "max-w-[75%] rounded-(--radius-field) px-3.5 py-2.5 text-sm leading-6",
                                  message.sender === "business"
                                    ? "ml-auto bg-primary text-primary-foreground"
                                    : "bg-white text-foreground ring-1 ring-border/70"
                                )}
                              >
                                {message.sender === "business" && isReminderMessage(message.body) ? (
                                  <span className="mb-2 inline-flex rounded-full bg-white/16 px-2.5 py-1 text-[11px] font-semibold text-primary-foreground/90">
                                    {t.reminder}
                                  </span>
                                ) : null}
                                <p>{message.body}</p>
                                <div
                                  className={cn(
                                    "mt-1.5 flex items-center gap-2 text-xs",
                                    message.sender === "business"
                                      ? "text-primary-foreground/75"
                                      : "text-muted-foreground"
                                  )}
                                >
                                  <span>{message.timestamp}</span>
                                  {message.sender === "business" && message.deliveryLabel ? (
                                    <span
                                      className={cn(
                                        "rounded-full px-2 py-0.5 font-medium",
                                        deliveryTone(message.deliveryStatus)
                                      )}
                                    >
                                      {message.deliveryLabel}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Background contrast, not a border-t — the composer's
                      own bordered pill below already gives it visual weight,
                      and a rule above it isn't card/table structure (AGENTS.md
                      rule 6), same as the directory table's bg-only header row. */}
                  <div className="bg-[#f8fafc] px-4 py-3">
                    <div className="mx-auto flex max-w-3xl items-end gap-3 rounded-(--radius-field) border border-border/75 bg-white px-3 py-2">
                      <Input
                        value={draftMessage}
                        onChange={(event) => setDraftMessage(event.target.value)}
                        placeholder={fmt(t.messagePlaceholder, { name: activeConversation.displayName || ownerName })}
                        className="h-10 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            sendMessage();
                          }
                        }}
                      />
                      <Button
                        onClick={sendMessage}
                        className="size-10 rounded-(--radius-card) px-0"
                        aria-label={t.sendMessage}
                        disabled={isPending || draftMessage.trim().length === 0}
                      >
                        <SendHorizontal className="size-4" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div className="flex flex-1 items-center justify-center px-6">
                  <div className="max-w-sm text-center">
                    <p className="text-[15px] font-semibold text-foreground">
                      {query.trim().length > 0
                        ? t.noMatchTitle
                        : conversations.length > 0
                          ? t.noSelectionTitle
                          : hasClients
                            ? t.bookingStartsTitle
                            : t.startWithClientTitle}
                    </p>
                    <p className="mt-1 text-sm leading-5 text-muted-foreground">
                      {query.trim().length > 0
                        ? t.noMatchCopy
                        : conversations.length > 0
                          ? t.noSelectionCopy
                          : hasClients
                            ? t.bookingStartsCopy
                            : t.startWithClientCopy}
                    </p>
                    {query.trim().length === 0 && conversations.length === 0 ? (
                      <Link
                        href={hasClients ? bookingHref : "/clients/new?next=calendar"}
                        className={cn(buttonVariants({ size: "sm" }), "mt-4 rounded-(--radius-tile)")}
                      >
                        {hasClients ? t.bookAppointment : t.addClient}
                      </Link>
                    ) : null}
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </WorkspacePage>
    </LazyMotionProvider>
  );
}
