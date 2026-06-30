"use client";

import { m, useReducedMotion } from "framer-motion";
import { Reveal } from "../motion/reveal";

const clinicTypes = [
  "Dental clinics",
  "Aesthetic clinics",
  "Dermatology clinics",
  "Physiotherapy clinics",
  "Wellness clinics",
  "Private practices",
  "Pediatric clinics",
  "Orthodontics",
];

function Chip({ label }: { label: string }) {
  return (
    <span className="shrink-0 rounded-full border border-black/[0.06] bg-white px-5 py-2.5 text-sm font-bold text-foreground shadow-[0_1px_2px_rgba(10,34,255,0.04)]">
      {label}
    </span>
  );
}

export function ClinicMarquee() {
  const reduce = useReducedMotion();
  const doubled = [...clinicTypes, ...clinicTypes];

  return (
    <section className="relative border-y border-border/50 bg-[var(--brand-wash)]/40 py-8 sm:py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center">
          <p className="eyebrow text-primary">Built for appointment-based care</p>
          <h2 className="mt-2 text-xl font-semibold text-[var(--brand-ink)] sm:text-2xl">
            One workspace, every kind of clinic.
          </h2>
        </Reveal>
      </div>
      <div className="relative mt-7 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
        {reduce ? (
          <div className="flex flex-wrap justify-center gap-3 px-4">
            {clinicTypes.map((type) => (
              <Chip key={type} label={type} />
            ))}
          </div>
        ) : (
          <m.div
            className="flex w-max gap-3"
            animate={{ x: ["0%", "-50%"] }}
            transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
          >
            {doubled.map((type, index) => (
              <Chip key={`${type}-${index}`} label={type} />
            ))}
          </m.div>
        )}
      </div>
    </section>
  );
}
