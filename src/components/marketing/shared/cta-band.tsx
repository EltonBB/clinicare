"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Reveal } from "../motion/reveal";
import { Magnetic } from "../motion/magnetic";

/**
 * Shared closing CTA band — a dark cinematic panel with a magnetic primary
 * action. Copy defaults work for any inner page; pass overrides where useful.
 */
export function CtaBand({
  title = "Bring your whole clinic into one calm workspace.",
  copy = "Start free with appointments, patients, staff, and reports — then grow into messaging, automation, and deeper operational insight.",
  primaryLabel = "Start free",
  secondaryLabel = "Talk to us",
}: {
  title?: string;
  copy?: string;
  primaryLabel?: string;
  secondaryLabel?: string;
}) {
  return (
    <section className="px-4 pb-24 pt-8 sm:px-6 lg:px-8">
      <Reveal className="relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-[linear-gradient(120deg,#0a1cb0_0%,#0A22FF_28%,#2f6bff_54%,#23a6d6_78%,#6a5cf0_100%)] px-6 py-16 text-center text-white shadow-[0_40px_120px_rgba(10,34,255,0.4)] sm:px-12 sm:py-20">
        <div aria-hidden className="vela-grid-texture pointer-events-none absolute inset-0 opacity-25" />
        {/* flowing cyan ribbon streak (Stripe-Connect style) */}
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-x-24 top-[36%] h-44 -rotate-6 bg-[linear-gradient(90deg,transparent,rgba(140,228,255,0.4),rgba(180,200,255,0.3),transparent)] blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-24 size-[28rem] rounded-full bg-[radial-gradient(circle,rgba(120,96,240,0.45),transparent_65%)] blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-28 -left-16 size-[26rem] rounded-full bg-[radial-gradient(circle,rgba(100,182,255,0.4),transparent_65%)] blur-3xl"
        />
        <div className="relative mx-auto max-w-2xl">
          <h2 className="display-2 text-white">{title}</h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-8 text-white/70">{copy}</p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Magnetic>
              <Link
                href="/sign-up"
                className="inline-flex h-12 min-w-32 items-center justify-center gap-2 whitespace-nowrap rounded-(--radius-field) bg-white px-6 text-sm font-bold text-primary shadow-[0_18px_44px_rgba(0,0,0,0.25)] transition-transform duration-(--duration-base) ease-out-quint hover:-translate-y-0.5"
              >
                {primaryLabel}
                <ArrowRight className="size-4" />
              </Link>
            </Magnetic>
            <Link
              href="/contact"
              className="inline-flex h-12 min-w-32 items-center justify-center whitespace-nowrap rounded-(--radius-field) border border-white/25 bg-white/5 px-6 text-sm font-bold text-white backdrop-blur transition-[transform,background-color] duration-(--duration-base) ease-out-quint hover:-translate-y-0.5 hover:bg-white/10"
            >
              {secondaryLabel}
            </Link>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
