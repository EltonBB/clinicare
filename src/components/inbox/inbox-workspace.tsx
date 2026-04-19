"use client";

import Link from "next/link";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import {
  ArrowRightLeft,
  ExternalLink,
  Search,
  SendHorizontal,
} from "lucide-react";

import {
  convertConversationToClientAction,
  deleteConversationAction,
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { InboxViewModel } from "@/lib/inbox";
import type { SettingsState } from "@/lib/settings";

type InboxWorkspaceProps = {
  initialView: InboxViewModel;
  ownerName: string;
  connection: SettingsState["whatsapp"]["connection"];
};

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

export function InboxWorkspace({
  initialView,
  ownerName,
  connection,
}: InboxWorkspaceProps) {
  const [conversations, setConversations] = useState(initialView.conversations);
  const [selectedConversationId, setSelectedConversationId] = useState(
    initialView.initialConversationId
  );
  const [query, setQuery] = useState("");
  const [draftMessage, setDraftMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [convertName, setConvertName] = useState("");
  const [convertEmail, setConvertEmail] = useState("");
  const [isPending, startTransition] = useTransition();
  const deferredQuery = useDeferredValue(query);

  const filteredConversations = useMemo(() => {
    const normalized = deferredQuery.trim().toLowerCase();

    return conversations.filter((conversation) => {
      if (!normalized) {
        return true;
      }

      return [conversation.clientName, conversation.preview, conversation.phone].some((value) =>
        value.toLowerCase().includes(normalized)
      );
    });
  }, [conversations, deferredQuery]);

  const activeConversation =
    filteredConversations.find(
      (conversation) => conversation.id === selectedConversationId
    ) ??
    filteredConversations[0] ??
    conversations.find((conversation) => conversation.id === selectedConversationId);

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

      setConversations(result.view.conversations);
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

    const interval = window.setInterval(() => {
      void refreshInbox();
    }, 3500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  function openConversation(conversationId: string) {
    setSelectedConversationId(conversationId);
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, unreadCount: 0 }
          : conversation
      )
    );
    startTransition(async () => {
      const result = await markConversationReadAction(conversationId);

      if (!result.ok) {
        setErrorMessage(result.error ?? "We couldn't open the conversation.");
        return;
      }

      setErrorMessage("");
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
    if (!window.confirm("Delete this conversation permanently?")) {
      return;
    }

    startTransition(async () => {
      const result = await deleteConversationAction(conversationId);

      if (!result.ok) {
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
    <>
      <Dialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen}>
        <DialogContent className="max-w-[460px] p-0">
          <DialogHeader className="glass-divider rounded-t-[1.2rem] px-5 py-5">
            <DialogTitle>Convert to client</DialogTitle>
            <DialogDescription>
              Create or link a client profile for this WhatsApp thread without losing the conversation history.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-5 py-5">
            <div className="surface-soft rounded-[1.05rem] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Phone
              </p>
              <p className="mt-2 text-sm font-medium text-foreground">
                {activeConversation?.phone}
              </p>
            </div>

            <div className="surface-soft space-y-2 rounded-[1.05rem] p-4">
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Client name
              </label>
              <Input
                value={convertName}
                onChange={(event) => setConvertName(event.target.value)}
                placeholder="Add the client name"
                className="h-11 rounded-[0.9rem] bg-white/84"
              />
            </div>

            <div className="surface-soft space-y-2 rounded-[1.05rem] p-4">
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Email
              </label>
              <Input
                value={convertEmail}
                onChange={(event) => setConvertEmail(event.target.value)}
                placeholder="Optional email"
                className="h-11 rounded-[0.9rem] bg-white/84"
              />
            </div>
          </div>

          <DialogFooter className="gap-3">
            <Button
              variant="outline"
              className="rounded-[0.9rem] bg-white/70"
              onClick={() => setConvertDialogOpen(false)}
              disabled={isPending}
            >
              Close
            </Button>
            <Button
              className="rounded-[0.9rem]"
              onClick={convertConversationToClient}
              disabled={isPending}
            >
              {isPending ? "Converting..." : "Convert to client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="overflow-hidden rounded-[1.2rem] border border-border/80 bg-white/94 shadow-[0_10px_24px_rgba(20,32,51,0.032)]">
        <div className="grid min-h-[780px] grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="border-b border-border/80 lg:border-b-0 lg:border-r">
          <div className="glass-divider px-5 py-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search messages or clients..."
                className="h-10 rounded-[0.9rem] bg-white/78 pl-9"
              />
            </div>
          </div>

          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-lg font-semibold text-foreground">Messages</p>
              <p className="text-sm text-muted-foreground">
                {connection.modeLabel} {connection.statusLabel.toLowerCase()} via{" "}
                {connection.senderPhoneNumber || "provider setup"}
              </p>
            </div>
          </div>

          <div className="max-h-[640px] overflow-y-auto">
            {errorMessage ? (
              <div className="px-5 pb-3">
                <div className="rounded-[0.8rem] border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
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
                  "flex w-full items-start gap-3 border-l-2 border-transparent px-5 py-4 text-left transition-[background-color,transform] duration-200 hover:bg-white/54",
                  activeConversation?.id === conversation.id &&
                    "border-primary bg-secondary/40"
                )}
              >
                <Avatar size="lg">
                  <AvatarFallback>
                    {conversation.clientName
                      .split(" ")
                      .map((part) => part[0] ?? "")
                      .join("")
                      .slice(0, 2)}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-foreground">
                        {conversation.displayName}
                      </p>
                      {!conversation.isLinkedClient ? (
                        <p className="mt-0.5 text-xs font-medium uppercase tracking-[0.12em] text-primary">
                          {conversation.contactStatusLabel}
                        </p>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {conversation.lastMessageAt}
                    </p>
                  </div>
                  <p className="mt-1 truncate text-sm text-muted-foreground">
                    {conversation.preview}
                  </p>
                </div>

                {conversation.unreadCount > 0 ? (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                    {conversation.unreadCount}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </aside>

        <section className="flex min-w-0 flex-col bg-white/92">
          {activeConversation ? (
            <>
              <div className="glass-divider flex items-center justify-between gap-4 px-5 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar size="lg">
                    <AvatarFallback>
                      {activeConversation.clientName
                        .split(" ")
                        .map((part) => part[0] ?? "")
                        .join("")
                        .slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold text-foreground">
                      {activeConversation.displayName}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {activeConversation.activeLabel}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {activeConversation.clientId ? (
                    <Link
                      href={`/clients?client=${activeConversation.clientId}`}
                      className="inline-flex items-center gap-1 text-sm font-medium text-primary"
                    >
                      View profile
                      <ExternalLink className="size-4" />
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-medium text-foreground">
                          Unregistered contact
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Reply here, then convert this thread into a client.
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-[0.7rem] bg-white/70"
                        onClick={openConvertDialog}
                        disabled={isPending}
                      >
                        <ArrowRightLeft className="size-4" />
                        Convert to client
                      </Button>
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-[0.7rem] border-destructive/25 text-destructive hover:bg-destructive/5 hover:text-destructive"
                    onClick={() => deleteConversation(activeConversation.id)}
                    disabled={isPending}
                  >
                    Delete conversation
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto bg-muted/22 px-5 py-5">
                <div className="mx-auto max-w-3xl space-y-4">
                  {activeConversation.messages.map((message) => (
                    <div key={message.id}>
                      {message.sender === "system" ? (
                        <div className="mx-auto w-fit rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">
                          {message.body}
                        </div>
                      ) : (
                        <div
                          className={cn(
                            "max-w-[75%] rounded-[1rem] px-4 py-3 text-sm leading-7 shadow-[0_14px_28px_rgba(20,32,51,0.04)]",
                            message.sender === "business"
                              ? "ml-auto bg-primary text-primary-foreground"
                              : "bg-white/86 text-foreground ring-1 ring-border/75"
                          )}
                        >
                          {message.sender === "business" && isReminderMessage(message.body) ? (
                            <span className="mb-2 inline-flex rounded-full bg-white/16 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary-foreground/90">
                              Reminder
                            </span>
                          ) : null}
                          <p>{message.body}</p>
                          <div
                            className={cn(
                              "mt-2 flex items-center gap-2 text-xs",
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
                  ))}
                </div>
              </div>

              <div className="glass-divider px-5 py-4">
                <div className="mx-auto flex max-w-3xl items-end gap-3 rounded-[1rem] border border-border/80 bg-white/84 px-3 py-3 shadow-[0_18px_36px_rgba(20,32,51,0.05)]">
                  <Input
                    value={draftMessage}
                    onChange={(event) => setDraftMessage(event.target.value)}
                    placeholder={`Type a message to ${activeConversation.displayName || ownerName}...`}
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
                    className="size-10 rounded-[0.9rem] px-0"
                    aria-label="Send message"
                    disabled={isPending || draftMessage.trim().length === 0}
                  >
                    <SendHorizontal className="size-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center px-6">
              <div className="max-w-sm space-y-3 text-center">
                <p className="text-base font-medium text-foreground">
                  {query.trim().length > 0
                    ? "No conversations match your search."
                    : "No conversations yet."}
                </p>
                <p className="text-sm leading-6 text-muted-foreground">
                  {query.trim().length > 0
                    ? "Try a different client name or phone number."
                    : "Open a client from the clients workspace or reply from WhatsApp to create a thread here automatically."}
                </p>
                {query.trim().length === 0 ? (
                  <Link
                    href="/clients"
                    className="inline-flex items-center justify-center rounded-[0.9rem] border border-border/80 bg-white px-4 py-2 text-sm font-medium text-foreground transition-[background-color,border-color] duration-200 hover:bg-secondary/50"
                  >
                    Open clients
                  </Link>
                ) : null}
              </div>
            </div>
          )}
        </section>
      </div>
      </div>
    </>
  );
}
