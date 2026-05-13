"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  Loader2,
  MessageSquareText,
  Search,
  UserRound,
  UsersRound,
} from "lucide-react";

import { cn } from "@/lib/utils";

type SearchResult = {
  id: string;
  type: "Client" | "Appointment" | "Staff" | "Message";
  title: string;
  detail: string;
  href: string;
};

const resultIcons = {
  Client: UserRound,
  Appointment: CalendarDays,
  Staff: UsersRound,
  Message: MessageSquareText,
};

export function GlobalSearch({ className }: { className?: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useEffect(() => {
    const trimmedQuery = query.trim();

    if (trimmedQuery.length < 2) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setIsLoading(true);

      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(trimmedQuery)}`,
          {
            signal: controller.signal,
            headers: { Accept: "application/json" },
          }
        );

        if (!response.ok) {
          setResults([]);
          return;
        }

        const payload = (await response.json()) as { results?: SearchResult[] };
        setResults(payload.results ?? []);
        setIsOpen(true);
      } catch {
        if (!controller.signal.aborted) {
          setResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }, 180);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  function closeSearch() {
    setIsOpen(false);
    setQuery("");
    setResults([]);
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="flex h-11 items-center gap-3 rounded-[0.9rem] border border-input bg-white/82 px-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && results[0]) {
              window.location.href = results[0].href;
            }

            if (event.key === "Escape") {
              setIsOpen(false);
            }
          }}
          placeholder="Search clients, appointments, staff, messages..."
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          type="search"
        />
        {isLoading ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      {isOpen && query.trim().length >= 2 ? (
        <div className="absolute left-0 right-0 top-13 z-50 overflow-hidden rounded-[1rem] border border-border bg-white shadow-[0_20px_50px_rgba(20,32,51,0.12)]">
          {results.length > 0 ? (
            <div className="max-h-[420px] overflow-y-auto p-2">
              {results.map((result) => {
                const Icon = resultIcons[result.type];

                return (
                  <Link
                    key={result.id}
                    href={result.href}
                    className="flex items-start gap-3 rounded-[0.8rem] px-3 py-3 transition-colors hover:bg-primary/8"
                    onClick={closeSearch}
                  >
                    <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[0.75rem] bg-primary/10 text-primary">
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-foreground">
                          {result.title}
                        </span>
                        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          {result.type}
                        </span>
                      </span>
                      <span className="mt-1 block truncate text-xs text-muted-foreground">
                        {result.detail}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="px-4 py-4 text-sm text-muted-foreground">
              {isLoading ? "Searching..." : "No matching records found."}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
