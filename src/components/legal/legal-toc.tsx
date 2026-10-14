"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Sticky table of contents that marks the section currently being read. Its
 * rail fills cobalt as the reader moves through the document, and the header
 * shows how far along they are and the honest reading time for the page.
 */
export function LegalToc({ items }: { items: { id: string; title: string }[] }) {
  const [active, setActive] = useState(items[0]?.id);
  const [progress, setProgress] = useState(0);
  const [minutes, setMinutes] = useState<number | null>(null);

  useEffect(() => {
    const article = document.getElementById(items[0]?.id ?? "")?.closest("article");
    if (!article) return;
    const words = (article.textContent ?? "").trim().split(/\s+/).length;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const r = article.getBoundingClientRect();
      const read = (window.innerHeight * 0.3 - r.top) / r.height;
      setProgress(Math.min(1, Math.max(0, read)));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    // First read on the next frame (state is only ever set from callbacks).
    frame = requestAnimationFrame(() => {
      setMinutes(Math.max(1, Math.round(words / 220)));
      measure();
    });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [items]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length) setActive(visible[0].target.id);
      },
      // A thin band near the top of the viewport decides which section is "current".
      { rootMargin: "-20% 0px -70% 0px" },
    );
    items.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav aria-label="On this page" className="lg:sticky lg:top-28">
      <div className="flex items-baseline justify-between text-xs font-semibold text-muted-foreground">
        <p>On this page</p>
        <p className="tabular-nums">
          {Math.round(progress * 100)}%{minutes ? <span className="font-normal"> · {minutes} min read</span> : null}
        </p>
      </div>
      <ol className="relative mt-4 border-l border-border/70">
        <span aria-hidden className="absolute -left-px top-0 w-px bg-primary/60 transition-[height] duration-150" style={{ height: `${progress * 100}%` }} />
        {items.map(({ id, title }) => (
          <li key={id}>
            <a
              href={`#${id}`}
              aria-current={active === id ? "location" : undefined}
              className={cn(
                "-ml-px block border-l-2 py-1.5 pl-4 text-sm transition-colors duration-(--duration-base) ease-out-quint",
                active === id
                  ? "border-primary font-medium text-[var(--brand-ink)]"
                  : "border-transparent text-muted-foreground hover:text-[var(--brand-ink)]",
              )}
            >
              {title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
