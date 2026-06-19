"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { motion, useReducedMotion, type Variants } from "framer-motion";

import { Magnetic } from "../motion/magnetic";
import { useScrollScene } from "../motion/use-scroll-scene";
import { useMarketingScroll } from "../motion/scroll-context";

// WebGL scene is client-only and lazy — the mesh + vignette stand in until it mounts.
const HeroScene = dynamic(() => import("../motion/hero-scene"), { ssr: false });

const trustSignals = ["No credit card to start", "Privacy-conscious by design", "WhatsApp-ready"];

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const lineGroup: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
};
const lineUp: Variants = {
  hidden: { y: "110%" },
  show: { y: 0, transition: { duration: 0.85, ease: EASE } },
};
const fade: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
};

export function CinematicHero() {
  const reduce = useReducedMotion();
  // Mount the WebGL orb only on a fine-pointer device without reduced-motion;
  // touch/low-power and motion-sensitive users get the static brand mesh instead.
  const { reduced, coarse } = useMarketingScroll();
  const showOrb = !reduced && !coarse;

  // Gentle scroll parallax on the brand mesh.
  const sceneRef = useScrollScene<HTMLElement>(({ root, gsap }) => {
    gsap.to(root.querySelectorAll("[data-hero-mesh]"), {
      yPercent: 10,
      ease: "none",
      scrollTrigger: { trigger: root, start: "top top", end: "bottom top", scrub: 0.5 },
    });
  });

  return (
    <section
      ref={sceneRef}
      className="relative isolate flex min-h-[100svh] items-center overflow-hidden px-4 pb-24 pt-28 sm:px-6 lg:px-8"
    >
      {/* Living brand mesh — overscanned via negative inset so scroll parallax never reveals an edge */}
      <div aria-hidden data-hero-mesh className="vela-mesh absolute -inset-[12%] -z-30" />
      {/* WebGL orb — ambient depth on the right; skipped under reduced-motion / touch */}
      <div aria-hidden className="absolute inset-0 -z-20">
        {showOrb ? <HeroScene /> : null}
      </div>
      {/* faint engineering grid */}
      <div aria-hidden className="vela-grid-texture absolute inset-0 -z-20 opacity-40" />
      {/* readability scrim: centered on mobile, left-weighted on desktop */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[34rem] w-[48rem] max-w-[96vw] -translate-x-1/2 -translate-y-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgba(4,7,22,0.66),transparent_72%)] blur-2xl lg:hidden"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 hidden bg-[linear-gradient(100deg,rgba(4,6,16,0.9)_0%,rgba(4,6,16,0.5)_42%,transparent_70%)] lg:block"
      />

      <div className="relative mx-auto w-full max-w-7xl">
        <div className="mx-auto max-w-2xl text-center lg:mx-0 lg:text-left">
          <motion.span
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-bold text-white/80 backdrop-blur"
          >
            <span className="size-1.5 rounded-full bg-[#64B6FF]" />
            The clinic operating system
          </motion.span>

          {reduce ? (
            <h1 className="display-1 mt-6 text-white">
              Run the whole clinic day from{" "}
              <span className="bg-[linear-gradient(110deg,#9ec3ff,#ffffff_62%)] bg-clip-text text-transparent">
                one calm workspace
              </span>
              .
            </h1>
          ) : (
            <motion.h1
              variants={lineGroup}
              initial="hidden"
              animate="show"
              className="display-1 mt-6 text-white"
            >
              <span className="block overflow-hidden pb-[0.1em]">
                <motion.span variants={lineUp} className="block">
                  Run the whole clinic day
                </motion.span>
              </span>
              <span className="block overflow-hidden pb-[0.1em]">
                <motion.span variants={lineUp} className="block">
                  from{" "}
                  <span className="bg-[linear-gradient(110deg,#9ec3ff,#ffffff_62%)] bg-clip-text text-transparent">
                    one calm workspace
                  </span>
                  .
                </motion.span>
              </span>
            </motion.h1>
          )}

          <motion.p
            variants={fade}
            initial={reduce ? false : "hidden"}
            animate="show"
            transition={reduce ? undefined : { delay: 0.35 }}
            className="mx-auto mt-6 max-w-xl text-base leading-8 text-white/65 sm:text-lg lg:mx-0"
          >
            Appointments, patients, staff, WhatsApp messages, payments, documents, and reports — brought into one
            clean system built for modern clinics.
          </motion.p>

          <motion.div
            variants={fade}
            initial={reduce ? false : "hidden"}
            animate="show"
            transition={reduce ? undefined : { delay: 0.45 }}
            className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start"
          >
            <Magnetic>
              <Link
                href="/sign-up"
                className="vela-gradient inline-flex h-12 min-w-32 items-center justify-center gap-2 whitespace-nowrap rounded-(--radius-field) px-6 text-sm font-bold text-white shadow-[0_18px_50px_rgba(10,34,255,0.5)] transition-transform duration-(--duration-base) ease-out-quint hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-white/40"
              >
                Start free
                <ArrowRight className="size-4" />
              </Link>
            </Magnetic>
            <Link
              href="/product"
              className="inline-flex h-12 min-w-32 items-center justify-center whitespace-nowrap rounded-(--radius-field) border border-white/20 bg-white/5 px-6 text-sm font-bold text-white backdrop-blur transition-[transform,background-color] duration-(--duration-base) ease-out-quint hover:-translate-y-0.5 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-white/40"
            >
              Explore the product
            </Link>
          </motion.div>

          <motion.div
            variants={fade}
            initial={reduce ? false : "hidden"}
            animate="show"
            transition={reduce ? undefined : { delay: 0.55 }}
            className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-semibold text-white/55 lg:justify-start"
          >
            {trustSignals.map((item) => (
              <span key={item} className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-[#64B6FF]" />
                {item}
              </span>
            ))}
          </motion.div>
        </div>
      </div>

      {/* scroll cue */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-7 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-white/40 lg:flex"
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Scroll</span>
        <span className="h-9 w-px bg-gradient-to-b from-white/50 to-transparent" />
      </div>
    </section>
  );
}
