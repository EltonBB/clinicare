"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CalendarDays,
  Loader2,
  MessageSquareText,
  Search,
  UserRound,
  UsersRound,
} from "lucide-react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
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

/** The quiet, always-visible control that opens the search palette — docked
 * compact in the sidebar, or full-width in the mobile header fallback. */
export function GlobalSearchTrigger({
  className,
  compact = false,
  onOpen,
}: {
  className?: string;
  compact?: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Search clients, appointments, staff, and messages"
      className={cn(
        "flex w-full items-center gap-2.5 rounded-(--radius-tile) border-0 bg-secondary/60 text-left transition-colors duration-(--duration-base) hover:bg-secondary",
        compact ? "h-10 px-3" : "h-11 gap-3 px-4",
        className
      )}
    >
      <Search className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
        {compact ? "Search" : "Search clients, appointments, staff, messages..."}
      </span>
      {compact ? (
        <kbd className="hidden shrink-0 rounded-[0.3rem] border border-border/70 bg-white px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground lg:inline-block">
          /
        </kbd>
      ) : null}
    </button>
  );
}

/** The spotlight-style command palette itself — a dimmed backdrop with a
 * centered panel, matching how Vercel/Linear/Raycast surface global search:
 * opened from anywhere (the sidebar trigger, the mobile trigger, or "/"),
 * rendered once and shared so only one can ever be open at a time. */
export function GlobalSearchPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setActiveIndex(0);
    }
  }, [open]);

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

  function navigateToResult(result: SearchResult) {
    onOpenChange(false);
    router.push(result.href);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        aria-label="Search"
        className="top-[12vh] flex max-h-[min(560px,80vh)] w-full max-w-[560px] translate-y-0 flex-col gap-0 rounded-(--radius-panel) p-0 shadow-(--shadow-pop) sm:max-w-[560px]"
      >
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border/70 px-4">
          <Search className="size-4.5 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
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
            }}
            placeholder="Search clients, appointments, staff, messages..."
            aria-label="Search clients, appointments, staff, and messages"
            aria-controls="global-search-results"
            aria-activedescendant={
              results[activeIndex] ? `global-search-result-${results[activeIndex].id}` : undefined
            }
            className="h-full min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
            type="search"
          />
          {isLoading ? <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" /> : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {query.trim().length < 2 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Type at least 2 characters to search.
            </p>
          ) : results.length > 0 ? (
            <div id="global-search-results" className="p-2" role="listbox">
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
                    onClick={() => onOpenChange(false)}
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
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              {isLoading ? "Searching..." : "No matching records found."}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3 border-t border-border/70 px-4 py-2 text-[11px] font-medium text-muted-foreground">
          {(
            [
              ["↑↓", "Navigate"],
              ["↵", "Open"],
              ["esc", "Close"],
            ] as const
          ).map(([key, label]) => (
            <span key={label} className="inline-flex items-center gap-1">
              <kbd className="rounded-[0.3rem] border border-border/70 bg-secondary/60 px-1.5 py-0.5 font-mono">
                {key}
              </kbd>
              {label}
            </span>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
