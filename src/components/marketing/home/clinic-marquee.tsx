"use client";

import { motion, useReducedMotion } from "framer-motion";
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
    <span className="shrink-0 rounded-full border border-border/80 bg-[var(--brand-wash)]/60 px-5 py-2.5 text-sm font-bold text-foreground">
      {label}
    </span>
  );
}

export function ClinicMarquee() {
  const reduce = useReducedMotion();
  const doubled = [...clinicTypes, ...clinicTypes];

  return (
    <section className="relative border-y border-border/60 bg-white py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center">
          <p className="eyebrow text-muted-foreground">Built for appointment-based care</p>
          <h2 className="mt-3 text-2xl font-semibold text-[var(--brand-ink)] sm:text-3xl">
            One workspace, every kind of clinic.
          </h2>
        </Reveal>
      </div>
      <div className="relative mt-9 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
        {reduce ? (
          <div className="flex flex-wrap justify-center gap-3 px-4">
            {clinicTypes.map((type) => (
              <Chip key={type} label={type} />
            ))}
          </div>
        ) : (
          <motion.div
            className="flex w-max gap-3"
            animate={{ x: ["0%", "-50%"] }}
            transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
          >
            {doubled.map((type, index) => (
              <Chip key={`${type}-${index}`} label={type} />
            ))}
          </motion.div>
        )}
      </div>
    </section>
  );
}
