"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { Menu, X } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { cn } from "@/lib/utils";
import { Magnetic } from "./motion/magnetic";
import { useMarketingScroll } from "./motion/scroll-context";

const navItems = [
  { label: "Product", href: "/product" },
  { label: "Pricing", href: "/pricing" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

/**
 * Marketing header. A quiet glass bar: transparent over the very top of the
 * page, solidifying to a hairline + blur once scrolled or when the mobile menu
 * opens, and turning ink while it sits over a dark section (`data-tone="dark"`,
 * e.g. the clinic day's evening and the footer). The current page's link keeps
 * its underline. The CTA is magnetic; the mobile menu pauses Lenis while open.
 */
export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [overDark, setOverDark] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { lenisRef } = useMarketingScroll();
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 24);
      // Is a dark section under the middle of the 64px bar?
      setOverDark(
        Array.from(document.querySelectorAll('[data-tone="dark"]')).some((el) => {
          const r = el.getBoundingClientRect();
          return r.top <= 32 && r.bottom > 32;
        }),
      );
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Pause smooth-scroll + lock the page behind the open mobile menu.
  // (Menu items close it on click, so no route-change effect is needed.)
  useEffect(() => {
    if (menuOpen) lenisRef.current?.stop();
    else lenisRef.current?.start();
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen, lenisRef]);

  const solid = scrolled || menuOpen;
  const dark = overDark && !menuOpen;

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color] duration-300",
        dark
          ? "border-white/10 bg-[var(--brand-ink)]/80 backdrop-blur-xl"
          : solid
            ? "border-border/60 bg-white/85 backdrop-blur-xl"
            : "border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <BrandMark href="/" includeSubtitle={false} tone={dark ? "light" : "default"} />

        <nav className={cn("hidden items-center gap-9 text-sm font-medium transition-colors duration-300 lg:flex", dark ? "text-white/60" : "text-muted-foreground")}>
          {navItems.map((item) => {
            const current = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "group relative transition-colors duration-(--duration-base)",
                  dark ? "hover:text-white" : "hover:text-foreground",
                  current && (dark ? "text-white" : "text-foreground"),
                )}
              >
                {item.label}
                <span
                  className={cn(
                    "absolute -bottom-1.5 left-0 h-px w-full origin-left bg-current transition-transform duration-300 ease-out-quint group-hover:scale-x-100",
                    current ? "scale-x-100" : "scale-x-0",
                  )}
                />
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className={cn(
              "hidden h-10 min-w-20 items-center justify-center whitespace-nowrap rounded-(--radius-mkt-field) px-4 text-sm font-medium transition-colors duration-(--duration-base) ease-out-quint sm:inline-flex",
              dark ? "text-white hover:text-white/70" : "text-foreground hover:text-primary",
            )}
          >
            Log in
          </Link>
          <Magnetic className="hidden sm:inline-flex">
            <Link
              href="/sign-up"
              className={cn(
                "inline-flex h-10 min-w-24 items-center justify-center whitespace-nowrap rounded-(--radius-mkt-field) px-4 text-sm font-medium transition-[transform,background-color,color] duration-(--duration-base) ease-out-quint hover:-translate-y-0.5 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/45",
                dark ? "bg-white text-[var(--brand-ink)]" : "bg-[var(--brand-ink)] text-white",
              )}
            >
              Start free
            </Link>
          </Magnetic>

          {/* Mobile menu toggle */}
          <button
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className={cn(
              "inline-flex size-10 items-center justify-center rounded-(--radius-mkt-field) border transition lg:hidden",
              dark ? "border-white/20 bg-transparent text-white" : "border-border/70 bg-white text-foreground",
            )}
          >
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {menuOpen ? (
          <m.div
            key="mobile-menu"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="border-b border-border/60 bg-white/95 backdrop-blur-xl lg:hidden"
          >
            <nav className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-4 sm:px-6">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-(--radius-mkt-field) px-3 py-3 text-base font-medium text-foreground transition hover:bg-[var(--brand-wash)] hover:text-primary"
                >
                  {item.label}
                </Link>
              ))}
              <div className="mt-2 grid gap-2">
                <Link
                  href="/login"
                  onClick={() => setMenuOpen(false)}
                  className="inline-flex h-11 items-center justify-center rounded-(--radius-mkt-field) border border-border/70 bg-white text-sm font-medium text-foreground"
                >
                  Log in
                </Link>
                <Link
                  href="/sign-up"
                  onClick={() => setMenuOpen(false)}
                  className="inline-flex h-11 items-center justify-center rounded-(--radius-mkt-field) bg-[var(--brand-ink)] text-sm font-medium text-white"
                >
                  Start free
                </Link>
              </div>
            </nav>
          </m.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
