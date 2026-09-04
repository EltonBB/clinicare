"use client";

import Link from "next/link";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { m } from "framer-motion";
import {
  ArrowRightLeft,
  CalendarPlus2,
  ExternalLink,
  Search,
  SendHorizontal,
  Trash2,
  UserPlus,
} from "lucide-react";

import {
  convertConversationToClientAction,
  deleteConversationAction,
  hydrateConversationAction,
  markConversationReadAction,
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
  WorkspaceHeader,
  WorkspacePage,
} from "@/components/workspace/workspace-layout";
import { cn, getInitials } from "@/lib/utils";
import { fadeIn } from "@/lib/motion";
import { LazyMotionProvider } from "@/components/layout/motion-provider";
import type { InboxViewModel } from "@/lib/inbox";
import type { SettingsState } from "@/lib/settings";

type InboxWorkspaceProps = {
  initialView: InboxViewModel;
  ownerName: string;
  connection: SettingsState["whatsapp"]["connection"];
  clientCount: number;
  recommendedClientId?: string;
};

type InboxFilter = "all" | "unread";

function isReminderMessage(body: string) {
  const normalized = body.toLowerCase();
  return (
    normalized.includes("this is a reminder for your appointment") ||
    normalized.includes("appointment is coming up") ||
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

export function InboxWorkspace({
  initialView,
  ownerName,
  connection,
  clientCount,
  recommendedClientId,
}: InboxWorkspaceProps) {
  const [conversations, setConversations] = useState(initialView.conversations);
  const [selectedConversationId, setSelectedConversationId] = useState(
    initialView.initialConversationId
  );
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
  const hasClients = clientCount > 0;
  const bookingHref = recommendedClientId
    ? `/calendar/new?client=${recommendedClientId}`
    : "/calendar/new";
  const connectionLine = connection.statusLabel;

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

      const result = await refreshInboxAction();

      if (!result.ok || !result.view || cancelled) {
        return;
      }

      setConversations((current) => {
        const currentById = new Map(
          current.map((conversation) => [conversation.id, conversation])
        );

        return result.view!.conversations.map((conversation) => {
          const existing = currentById.get(conversation.id);
          // A conversation already hydrated to full history locally must not
          // be clobbered back down to a 1-message preview by a poll response
          // that hasn't caught up yet — e.g. a mark-read that would promote
          // it into the recency-capped "recent" bucket hasn't committed
          // server-side by the time this poll ran.
          const merged =
            existing?.hasFullHistory && !conversation.hasFullHistory
              ? { ...conversation, hasFullHistory: true, messages: existing.messages }
              : conversation;

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

  // Hydrates the selected conversation's full thread whenever it's only a
  // 1-message preview (hasFullHistory: false) — covers every way a
  // conversation becomes selected: a sidebar click, the initial load, or a
  // deep link (?conversation=/?client=) landing straight on an old, unread
  // conversation the recency cap left out.
  useEffect(() => {
    if (!selectedConversationId) {
      return;
    }

    const target = conversations.find(
      (conversation) => conversation.id === selectedConversationId
    );

    if (!target || target.hasFullHistory) {
      return;
    }

    let cancelled = false;

    hydrateConversationAction(selectedConversationId)
      .then((result) => {
        if (cancelled) {
          return;
        }

        if (!result.ok || !result.conversation) {
          setErrorMessage(result.error ?? "We couldn't load the full conversation history.");
          return;
        }

        const hydrated = result.conversation;
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
          setErrorMessage("We couldn't load the full conversation history.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedConversationId, conversations]);

  function openConversation(conversationId: string) {
    setSelectedConversationId(conversationId);
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
          setErrorMessage(result.error ?? "We couldn't open the conversation.");
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
      activeConversation.displayName === "Unregistered contact"
        ? ""
        : activeConversation.displayName
    );
    setConvertEmail("");
    setConvertDialogOpen(true);
  }

  function sendMessage() {
    const body = draftMessage.trim();

    if (!body || !activeConversation) {
      return;
    }
    const activeConversationId = activeConversation.id;

    startTransition(async () => {
      const result = await sendInboxMessageAction(activeConversationId, body);

      if (!result.ok || !result.conversation) {
        setErrorMessage(result.error ?? "We couldn't send the message.");
        return;
      }

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
        setErrorMessage(result.error ?? "We couldn't delete the conversation.");
        return;
      }

      setConversations((current) => {
        const nextConversations = current.filter(
          (conversation) => conversation.id !== conversationId
        );
        setSelectedConversationId(nextConversations[0]?.id ?? "");
        return nextConversations;
      });
      setConfirmingDeleteId(null);
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

      if (!result.ok || !result.conversation) {
        setErrorMessage(result.error ?? "We couldn't convert this conversation.");
        return;
      }

      setConversations((current) => [
        result.conversation!,
        ...current.filter((conversation) => conversation.id !== result.conversation!.id),
      ]);
      setSelectedConversationId(result.conversation.id);
      setConvertDialogOpen(false);
      setConvertName("");
      setConvertEmail("");
      setErrorMessage("");
    });
  }

  return (
    <LazyMotionProvider>
      <Dialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen}>
        <DialogContent className="max-w-[460px]">
          <DialogHeader>
            <div className="mb-2 flex size-10 items-center justify-center rounded-(--radius-tile) border border-border/75 bg-white text-primary">
              <ArrowRightLeft className="size-4" />
            </div>
            <DialogTitle className="text-[1.1rem] font-semibold">Convert to client</DialogTitle>
            <DialogDescription className="text-sm leading-6">
              Create or link a client profile for this conversation without losing the history.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Phone</p>
              <p className="text-sm font-medium text-foreground">{activeConversation?.phone}</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Client name</label>
              <Input
                value={convertName}
                onChange={(event) => setConvertName(event.target.value)}
                placeholder="Add the client name"
                className="h-10 rounded-(--radius-card) bg-white"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <Input
                value={convertEmail}
                onChange={(event) => setConvertEmail(event.target.value)}
                placeholder="Optional email"
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
              {isPending ? "Converting..." : "Convert to client"}
            </Button>
            <p className="text-xs font-medium leading-5 text-muted-foreground">
              This keeps the thread history attached to the new client profile.
            </p>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={confirmingDeleteId !== null}
        onOpenChange={(open) => setConfirmingDeleteId(open ? confirmingDeleteId : null)}
        title="Delete this conversation?"
        description="This permanently removes the message history for this conversation. This can't be undone."
        isPending={isPending}
        onConfirm={() => {
          if (confirmingDeleteId) deleteConversation(confirmingDeleteId);
        }}
      />

      <WorkspacePage size="wide">
        <WorkspaceHeader
          title="Inbox"
          description="Client conversations, replies, and unknown contacts."
        />

        <div className="surface-card min-h-[640px] overflow-hidden p-0 lg:h-[calc(100vh-174px)]">
          <div className="grid h-full grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="flex min-h-0 flex-col border-b border-border/80 lg:border-b-0 lg:border-r">
              <div className="space-y-2.5 px-3.5 pb-3 pt-3.5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search conversations..."
                    className="h-10 rounded-(--radius-card) bg-white pl-9"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <FilterChip
                    shape="pill"
                    active={filter === "all"}
                    count={conversations.length}
                    onClick={() => setFilter("all")}
                  >
                    All
                  </FilterChip>
                  <FilterChip
                    shape="pill"
                    active={filter === "unread"}
                    count={displayedUnreadTotal}
                    onClick={() => setFilter("unread")}
                  >
                    Unread
                  </FilterChip>
                </div>
                <p className="truncate text-xs text-muted-foreground">{connectionLine}</p>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto border-t border-border/70">
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
                {filteredConversations.length === 0 ? (
                  <div className="px-4 py-6">
                    <WorkspaceEmptyState
                      icon={Search}
                      title="No conversations found"
                      description={
                        filter === "unread"
                          ? "Everything is read. New replies appear here."
                          : "Try a different search term or wait for the next client message."
                      }
                      compact
                    />
                  </div>
                ) : null}
              </div>
            </aside>

            <section className="flex min-w-0 flex-col bg-white/92">
              {activeConversation ? (
                <m.div
                  key={activeConversation.id}
                  variants={fadeIn}
                  initial="initial"
                  animate="animate"
                  className="flex min-h-0 flex-1 flex-col"
                >
                  <div className="flex items-center justify-between gap-3.5 border-b border-border/70 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
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
                          View profile
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
                          Convert to client
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="size-9 rounded-(--radius-card) border-border/80 bg-white px-0 text-muted-foreground hover:border-destructive/30 hover:bg-destructive/5 hover:text-destructive"
                        onClick={() => setConfirmingDeleteId(activeConversation.id)}
                        disabled={isPending}
                        aria-label="Delete conversation"
                        title="Delete conversation"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto bg-muted/22 px-4 py-4">
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
                                    Reminder
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

                  <div className="border-t border-border/70 px-4 py-3">
                    <div className="mx-auto flex max-w-3xl items-end gap-3 rounded-(--radius-field) border border-border/75 bg-white px-3 py-2">
                      <Input
                        value={draftMessage}
                        onChange={(event) => setDraftMessage(event.target.value)}
                        placeholder={`Message ${activeConversation.displayName || ownerName}...`}
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
                        aria-label="Send message"
                        disabled={isPending || draftMessage.trim().length === 0}
                      >
                        <SendHorizontal className="size-4" />
                      </Button>
                    </div>
                  </div>
                </m.div>
              ) : (
                <div className="flex flex-1 items-center justify-center px-6">
                  <div className="max-w-md space-y-5 text-center">
                    {query.trim().length === 0 ? (
                      <div className="mx-auto flex size-12 items-center justify-center rounded-(--radius-card) bg-primary/12 text-primary">
                        {hasClients ? (
                          <CalendarPlus2 className="size-5" />
                        ) : (
                          <UserPlus className="size-5" />
                        )}
                      </div>
                    ) : null}
                    <p className="text-base font-medium text-foreground">
                      {query.trim().length > 0
                        ? "No conversations match your search."
                        : hasClients
                          ? "No inbox conversations yet."
                          : "Add a client to start the workspace."}
                    </p>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {query.trim().length > 0
                        ? "Try a different client name or phone number."
                        : hasClients
                          ? "WhatsApp replies will appear here. You can also book the first appointment and then open that client thread."
                          : "Create the first client, then Vela can connect that person to bookings and inbox history."}
                    </p>
                    {query.trim().length === 0 ? (
                      <div className="flex flex-col justify-center gap-2 sm:flex-row">
                        <Link
                          href={hasClients ? bookingHref : "/clients/new?next=calendar"}
                          className={cn(buttonVariants({ variant: "solid" }), "h-10 rounded-(--radius-card) px-4")}
                        >
                          {hasClients ? (
                            <CalendarPlus2 className="size-4" />
                          ) : (
                            <UserPlus className="size-4" />
                          )}
                          {hasClients ? "Book first appointment" : "Add first client"}
                        </Link>
                        {hasClients ? (
                          <Link
                            href="/clients"
                            className={cn(buttonVariants({ variant: "outline" }), "h-10 rounded-(--radius-card) px-4")}
                          >
                            Open clients
                          </Link>
                        ) : null}
                      </div>
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
