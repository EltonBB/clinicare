"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Reveal } from "../motion/reveal";
import { Magnetic } from "../motion/magnetic";

export function FinalCta() {
  return (
    <section className="px-4 pb-24 pt-8 sm:px-6 lg:px-8">
      <Reveal className="relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-[radial-gradient(120%_140%_at_50%_0%,#0c1c4a,#070d24_60%,#05060f)] px-6 py-16 text-center text-white shadow-[0_40px_120px_rgba(10,34,255,0.3)] sm:px-12 sm:py-20">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-64 w-[42rem] max-w-full bg-[radial-gradient(circle,rgba(100,182,255,0.28),transparent_65%)] blur-3xl"
        />
        <div className="relative mx-auto max-w-2xl">
          <h2 className="display-2 text-white">Bring your whole clinic into one calm workspace.</h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-8 text-white/70">
            Start free with appointments, patients, staff, and reports — then grow into messaging, automation, and
            deeper operational insight.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Magnetic>
              <Link
                href="/sign-up"
                className="inline-flex h-12 min-w-32 items-center justify-center gap-2 whitespace-nowrap rounded-(--radius-field) bg-white px-6 text-sm font-bold text-primary shadow-[0_18px_44px_rgba(0,0,0,0.25)] transition-transform duration-(--duration-base) ease-out-quint hover:-translate-y-0.5"
              >
                Start free
                <ArrowRight className="size-4" />
              </Link>
            </Magnetic>
            <Link
              href="/contact"
              className="inline-flex h-12 min-w-32 items-center justify-center whitespace-nowrap rounded-(--radius-field) border border-white/25 bg-white/5 px-6 text-sm font-bold text-white backdrop-blur transition-[transform,background-color] duration-(--duration-base) ease-out-quint hover:-translate-y-0.5 hover:bg-white/10"
            >
              Talk to us
            </Link>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
