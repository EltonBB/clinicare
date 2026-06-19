"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { Magnetic } from "./motion/magnetic";
import { useMarketingScroll } from "./motion/scroll-context";

const navItems = [
  { label: "Product", href: "/product" },
  { label: "Pricing", href: "/pricing" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

/**
 * Marketing header. On dark hero pages (`overlay`) it floats transparent with
 * light content and solidifies to the white glass bar once scrolled or when the
 * mobile menu opens. On light pages it stays solid. The CTA is magnetic; the
 * mobile menu pauses Lenis while open.
 */
export function SiteHeader({ overlay = false }: { overlay?: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { lenisRef } = useMarketingScroll();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
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

  const solid = scrolled || !overlay || menuOpen;

  return (
    <header
      className={
        "fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,box-shadow] duration-300 " +
        (solid
          ? "border-b border-border/70 bg-white/86 backdrop-blur-xl"
          : "border-b border-transparent bg-transparent")
      }
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <BrandMark href="/" includeSubtitle={false} tone={solid ? "default" : "light"} />

        <nav
          className={
            "hidden items-center gap-9 text-sm font-semibold lg:flex " +
            (solid ? "text-muted-foreground" : "text-white/80")
          }
        >
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={
                "group relative " + (solid ? "hover:text-primary" : "hover:text-white")
              }
            >
              {item.label}
              <span className="absolute -bottom-1.5 left-0 h-px w-full origin-left scale-x-0 bg-current transition-transform duration-300 ease-out-quint group-hover:scale-x-100" />
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className={
              "hidden h-10 min-w-20 items-center justify-center whitespace-nowrap rounded-[0.75rem] px-4 text-sm font-semibold transition-[color,background-color,border-color] duration-(--duration-base) ease-out-quint sm:inline-flex " +
              (solid
                ? "border border-border/80 bg-white text-foreground hover:border-primary/40 hover:text-primary"
                : "border border-white/25 bg-white/5 text-white backdrop-blur hover:bg-white/10")
            }
          >
            Log in
          </Link>
          <Magnetic className="hidden sm:inline-flex">
            <Link
              href="/sign-up"
              className="vela-gradient inline-flex h-10 min-w-24 items-center justify-center whitespace-nowrap rounded-[0.75rem] px-4 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(10,34,255,0.26)] transition-transform duration-(--duration-base) ease-out-quint hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/45"
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
            className={
              "inline-flex size-10 items-center justify-center rounded-[0.75rem] border transition lg:hidden " +
              (solid
                ? "border-border/80 bg-white text-foreground"
                : "border-white/25 bg-white/5 text-white backdrop-blur")
            }
          >
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {menuOpen ? (
          <motion.div
            key="mobile-menu"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="border-b border-border/70 bg-white/95 backdrop-blur-xl lg:hidden"
          >
            <nav className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-4 sm:px-6">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-(--radius-field) px-3 py-3 text-base font-semibold text-foreground transition hover:bg-[var(--brand-wash)] hover:text-primary"
                >
                  {item.label}
                </Link>
              ))}
              <div className="mt-2 grid gap-2">
                <Link
                  href="/login"
                  onClick={() => setMenuOpen(false)}
                  className="inline-flex h-11 items-center justify-center rounded-(--radius-field) border border-border/80 bg-white text-sm font-semibold text-foreground"
                >
                  Log in
                </Link>
                <Link
                  href="/sign-up"
                  onClick={() => setMenuOpen(false)}
                  className="vela-gradient inline-flex h-11 items-center justify-center rounded-(--radius-field) text-sm font-semibold text-white shadow-[0_14px_34px_rgba(10,34,255,0.26)]"
                >
                  Start free
                </Link>
              </div>
            </nav>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
