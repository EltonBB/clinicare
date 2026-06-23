"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import type { CalendarSelectOption } from "@/lib/calendar";

type ClientComboboxProps = {
  value: string;
  onChange: (id: string) => void;
  /** Bounded initial list (recent clients + any preselected one). */
  initialOptions: CalendarSelectOption[];
  className?: string;
};

function optionLabel(option: CalendarSelectOption) {
  return option.phone ? `${option.name} — ${option.phone}` : option.name;
}

/**
 * Server-backed client picker: shows a bounded recent list and queries
 * /api/clients/search as the user types, so booking/edit forms never load the
 * whole client table. Controlled via `value`/`onChange` (the client id).
 */
export function ClientCombobox({
  value,
  onChange,
  initialOptions,
  className,
}: ClientComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CalendarSelectOption[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const trimmedQuery = query.trim();
  // Derived list: the recent (initial) options until the user types a real
  // query, then the server results. No state writes for the empty-query case.
  const options = trimmedQuery.length >= 2 ? searchResults : initialOptions;

  // Stable id -> label lookup across the initial list and any fetched results,
  // so the selected client's label shows even when it isn't in the current list.
  const labelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const option of initialOptions) map.set(option.id, optionLabel(option));
    for (const option of searchResults) map.set(option.id, optionLabel(option));
    return map;
  }, [initialOptions, searchResults]);

  const selectedLabel = labelById.get(value) ?? "";

  useEffect(() => {
    const q = query.trim();

    if (q.length < 2) {
      return;
    }

    const controller = new AbortController();
    // State is only set inside this async callback, never synchronously in the
    // effect body (avoids cascading renders / react-hooks/set-state-in-effect).
    const timer = setTimeout(() => {
      setLoading(true);
      fetch(`/api/clients/search?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      })
        .then((response) => (response.ok ? response.json() : { clients: [] }))
        .then((data: { clients?: CalendarSelectOption[] }) => {
          setSearchResults(data.clients ?? []);
        })
        .catch(() => {
          // aborted or network error — keep the previous results
        })
        .finally(() => setLoading(false));
    }, 200);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-(--radius-card) border border-border/80 bg-white px-3 text-left text-sm text-foreground outline-none transition-[border-color,box-shadow] duration-(--duration-base) focus:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
      >
        <span className={cn("truncate", !selectedLabel && "text-muted-foreground")}>
          {selectedLabel || "Select a client"}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </button>

      {open ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-(--radius-card) border border-border bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name or phone"
              className="h-9 w-full bg-transparent text-sm outline-none"
            />
          </div>
          <ul
            role="listbox"
            aria-label="Clients"
            className="max-h-56 overflow-auto py-1"
          >
            {options.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">
                {loading
                  ? "Searching…"
                  : trimmedQuery.length >= 2
                    ? "No matching clients"
                    : "Type at least 2 characters to search"}
              </li>
            ) : (
              options.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(option.id);
                      setQuery("");
                      setOpen(false);
                    }}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60"
                  >
                    <span className="truncate">{optionLabel(option)}</span>
                    {option.id === value ? (
                      <Check className="size-4 shrink-0 text-primary" />
                    ) : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
