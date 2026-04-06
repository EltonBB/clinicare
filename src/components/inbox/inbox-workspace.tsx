"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState, useTransition } from "react";
import {
  ExternalLink,
  Search,
  SendHorizontal,
} from "lucide-react";

import {
  deleteConversationAction,
  markConversationReadAction,
  sendInboxMessageAction,
} from "@/app/(workspace)/inbox/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { InboxViewModel } from "@/lib/inbox";

type InboxWorkspaceProps = {
  initialView: InboxViewModel;
  ownerName: string;
};

export function InboxWorkspace({
  initialView,
  ownerName,
}: InboxWorkspaceProps) {
  const [conversations, setConversations] = useState(initialView.conversations);
  const [selectedConversationId, setSelectedConversationId] = useState(
    initialView.initialConversationId
  );
  const [query, setQuery] = useState("");
  const [draftMessage, setDraftMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
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

  return (
    <div className="overflow-hidden rounded-[0.95rem] border border-border bg-card">
      <div className="grid min-h-[780px] grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="border-b border-border lg:border-b-0 lg:border-r">
          <div className="border-b border-border px-5 py-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search messages or clients..."
                className="h-10 rounded-[0.75rem] bg-card pl-9"
              />
            </div>
          </div>

          <div className="flex items-center justify-between px-5 py-4">
            <p className="text-lg font-semibold text-foreground">Messages</p>
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
                  "flex w-full items-start gap-3 border-l-2 border-transparent px-5 py-4 text-left transition-colors hover:bg-secondary/45",
                  activeConversation?.id === conversation.id &&
                    "border-primary bg-secondary/45"
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
                    <p className="truncate text-base font-semibold text-foreground">
                      {conversation.clientName}
                    </p>
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

        <section className="flex min-w-0 flex-col bg-[#fdfdfb]">
          {activeConversation ? (
            <>
              <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
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
                      {activeConversation.clientName}
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
                    <span className="text-sm text-muted-foreground">
                      No client linked
                    </span>
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

              <div className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.025)_1px,transparent_1px)] [background-size:24px_24px] px-5 py-5">
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
                            "max-w-[75%] rounded-[0.9rem] px-4 py-3 text-sm leading-7",
                            message.sender === "business"
                              ? "ml-auto bg-primary text-primary-foreground"
                              : "bg-card text-foreground ring-1 ring-border"
                          )}
                        >
                          <p>{message.body}</p>
                          <p
                            className={cn(
                              "mt-2 text-xs",
                              message.sender === "business"
                                ? "text-primary-foreground/75"
                                : "text-muted-foreground"
                            )}
                          >
                            {message.timestamp}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-border bg-card px-5 py-4">
                <div className="mx-auto flex max-w-3xl items-end gap-3 rounded-[0.95rem] border border-border bg-background px-3 py-3">
                  <Input
                    value={draftMessage}
                    onChange={(event) => setDraftMessage(event.target.value)}
                    placeholder={`Type a message to ${activeConversation.clientName || ownerName}...`}
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
                    className="size-10 rounded-[0.75rem] px-0"
                    aria-label="Send message"
                    disabled={isPending || draftMessage.trim().length === 0}
                  >
                    <SendHorizontal className="size-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              No conversations match your search.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
