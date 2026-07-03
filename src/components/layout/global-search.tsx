"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
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
        setActiveIndex(0);
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
    setActiveIndex(0);
  }

  function navigateToResult(result: SearchResult) {
    closeSearch();
    router.push(result.href);
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="flex h-11 items-center gap-3 rounded-(--radius-field) border border-input bg-white/88 px-4 shadow-[0_12px_30px_rgba(20,21,47,0.04),inset_0_1px_0_rgba(255,255,255,0.78)] focus-within:border-primary/45 focus-within:ring-3 focus-within:ring-ring/30">
        <Search className="size-4 shrink-0 text-primary" />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((current) => Math.min(current + 1, results.length - 1));
            }

            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((current) => Math.max(current - 1, 0));
            }

            if (event.key === "Enter" && results[activeIndex]) {
              event.preventDefault();
              navigateToResult(results[activeIndex]);
            }

            if (event.key === "Escape") {
              setIsOpen(false);
            }
          }}
          placeholder="Search clients, appointments, staff, messages..."
          aria-label="Search clients, appointments, staff, and messages"
          aria-controls="global-search-results"
          aria-activedescendant={
            isOpen && results[activeIndex] ? `global-search-result-${results[activeIndex].id}` : undefined
          }
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          type="search"
        />
        {isLoading ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      {isOpen && query.trim().length >= 2 ? (
        <div className="state-pop absolute left-0 right-0 top-13 z-50 overflow-hidden rounded-(--radius-panel) border border-border/80 bg-white/96 shadow-[0_24px_60px_rgba(20,21,47,0.14)] backdrop-blur-xl">
          {results.length > 0 ? (
            <div id="global-search-results" className="max-h-[420px] overflow-y-auto p-2" role="listbox">
              {results.map((result, index) => {
                const Icon = resultIcons[result.type];

                return (
                  <Link
                    key={result.id}
                    id={`global-search-result-${result.id}`}
                    href={result.href}
                    role="option"
                    aria-selected={index === activeIndex}
                    className={cn(
                      "flex items-start gap-3 rounded-(--radius-field) px-3 py-3 transition-colors duration-(--duration-base) hover:bg-primary/8",
                      index === activeIndex && "bg-primary/8"
                    )}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={closeSearch}
                  >
                    <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-(--radius-field) border border-border/80 bg-white text-primary">
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
