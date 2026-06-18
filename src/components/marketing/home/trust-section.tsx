"use client";

import { Activity, ClipboardList, FileImage, LockKeyhole, ShieldCheck, Stethoscope } from "lucide-react";
import type { ElementType } from "react";
import { Reveal, RevealGroup, RevealItem } from "../motion/reveal";

const items = [
  { icon: LockKeyhole, title: "Private clinic records", copy: "Patient data stays inside the workspace, never exposed to the public web." },
  { icon: FileImage, title: "Secure document storage", copy: "Scans, images, and files are kept in private, access-controlled storage." },
  { icon: ShieldCheck, title: "Authenticated access", copy: "Every workspace route is protected and tenant-isolated by design." },
  { icon: ClipboardList, title: "Customer-safe reporting", copy: "Operational insights stay free of clinical detail and identifying data." },
  { icon: Stethoscope, title: "Provider complexity hidden", copy: "Clinics see simple product language, never technical provider internals." },
  { icon: Activity, title: "Built privacy-first", copy: "Designed to be HIPAA-ready before the first US clinic goes live." },
] satisfies Array<{ icon: ElementType; title: string; copy: string }>;

export function TrustSection() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
      <Reveal className="max-w-2xl">
        <p className="eyebrow text-muted-foreground">Privacy-conscious by design</p>
        <h2 className="mt-3 display-2 text-[var(--brand-ink)]">Trust is part of the product, not an afterthought.</h2>
        <p className="mt-5 text-base leading-8 text-muted-foreground">
          Vela keeps the clinic experience focused on safe access, organized records, readable reporting, and simple
          language — the foundations a serious clinic expects.
        </p>
      </Reveal>
      <RevealGroup className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(({ icon: Icon, title, copy }) => (
          <RevealItem
            key={title}
            className="rounded-(--radius-panel) border border-border/80 bg-white p-6 shadow-[0_16px_44px_rgba(20,21,47,0.045)] transition-[transform,border-color] duration-300 ease-out hover:-translate-y-1 hover:border-primary/30"
          >
            <span className="vela-icon-tile">
              <Icon className="size-5" />
            </span>
            <h3 className="mt-5 text-base font-bold text-[var(--brand-ink)]">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy}</p>
          </RevealItem>
        ))}
      </RevealGroup>
    </section>
  );
}
