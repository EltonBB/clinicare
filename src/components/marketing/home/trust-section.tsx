"use client";

import { FileText, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";

import { Reveal, RevealGroup, RevealItem } from "../motion/reveal";

const CARD =
  "flex flex-col rounded-(--radius-hero) border border-black/[0.06] bg-white p-6 ring-1 ring-primary/[0.04] shadow-[0_1px_2px_rgba(10,34,255,0.05),0_22px_54px_-22px_rgba(10,34,255,0.2)] transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_1px_2px_rgba(10,34,255,0.05),0_34px_74px_-26px_rgba(10,34,255,0.32)]";

export function TrustSection() {
  return (
    <section className="relative overflow-hidden bg-[linear-gradient(180deg,#ffffff_0%,#f5f8ff_100%)] py-24 sm:py-32">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 top-10 size-[34rem] rounded-full bg-[radial-gradient(circle,rgba(100,182,255,0.09),transparent_62%)] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 bottom-0 size-[30rem] rounded-full bg-[radial-gradient(circle,rgba(99,90,214,0.06),transparent_62%)] blur-3xl"
      />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="max-w-2xl">
          <p className="eyebrow text-primary">Privacy-conscious by design</p>
          <h2 className="mt-3 display-2 text-balance text-[var(--brand-ink)]">
            Trust is part of the product, not an afterthought.
          </h2>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">
            Patient data stays inside the workspace, messages carry only what they need to, and the clinic always sees
            simple language — the foundations a serious clinic expects.
          </p>
        </Reveal>

        <RevealGroup className="mt-12 grid gap-4 md:grid-cols-2">
          {/* Private records */}
          <RevealItem className={CARD}>
            <span className="vela-icon-tile ring-1 ring-primary/10">
              <LockKeyhole className="size-5" />
            </span>
            <h3 className="mt-5 text-base font-bold text-[var(--brand-ink)]">Private clinic records</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Patient data lives inside the workspace, never exposed to the public web.
            </p>
            <div className="mt-5 space-y-2">
              <div className="flex items-center gap-2 rounded-(--radius-field) border border-black/[0.06] bg-[var(--brand-wash)]/50 px-3 py-2.5">
                <ShieldCheck className="size-4 text-primary" />
                <span className="text-xs font-bold text-[var(--brand-ink)]">Tenant-isolated database</span>
                <span className="ml-auto text-[11px] font-semibold text-emerald-600">Protected</span>
              </div>
              <div className="flex items-center gap-2 rounded-(--radius-field) border border-black/[0.06] bg-[var(--brand-wash)]/50 px-3 py-2.5">
                <LockKeyhole className="size-4 text-primary" />
                <span className="text-xs font-bold text-[var(--brand-ink)]">Authenticated routes only</span>
                <span className="ml-auto text-[11px] font-semibold text-emerald-600">Enforced</span>
              </div>
            </div>
          </RevealItem>

          {/* Minimum-necessary messaging — the proof moment */}
          <RevealItem className={CARD}>
            <span className="vela-icon-tile ring-1 ring-primary/10">
              <Sparkles className="size-5" />
            </span>
            <h3 className="mt-5 text-base font-bold text-[var(--brand-ink)]">Minimum-necessary messaging</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Reminders carry the patient name and appointment time — and nothing clinical.
            </p>
            <div className="mt-5 rounded-(--radius-field) border border-black/[0.06] bg-[var(--brand-wash)]/50 p-3">
              <div className="flex items-center gap-2">
                <span className="vela-gradient flex size-7 items-center justify-center rounded-(--radius-tile) text-[10px] font-bold text-white">
                  MN
                </span>
                <p className="text-xs font-bold text-[var(--brand-ink)]">Maya Novak</p>
                <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-[9px] font-bold text-muted-foreground">
                  Reminder
                </span>
              </div>
              <p className="mt-2 rounded-[0.7rem] rounded-tl-sm border border-black/[0.06] bg-white px-3 py-2 text-xs font-semibold text-foreground">
                Hi Maya — a reminder of your appointment on Thursday at 14:30. See you soon.
              </p>
              <p className="mt-2 text-[10px] font-bold text-muted-foreground">Name + time only — never clinical detail.</p>
            </div>
          </RevealItem>

          {/* Secure documents */}
          <RevealItem className={CARD}>
            <span className="vela-icon-tile ring-1 ring-primary/10">
              <FileText className="size-5" />
            </span>
            <h3 className="mt-5 text-base font-bold text-[var(--brand-ink)]">Secure document storage</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Scans, images, and files are kept in private, access-controlled storage.
            </p>
            <div className="mt-5 space-y-2">
              <div className="flex items-center gap-2.5 rounded-(--radius-field) border border-black/[0.06] bg-[var(--brand-wash)]/50 px-3 py-2.5">
                <span className="flex size-7 items-center justify-center rounded-(--radius-tile) border border-black/[0.06] bg-white">
                  <FileText className="size-3.5 text-primary" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-[var(--brand-ink)]">x-ray-26.png</p>
                  <p className="text-[10px] font-semibold text-muted-foreground">Private bucket · signed access</p>
                </div>
                <LockKeyhole className="ml-auto size-3.5 text-muted-foreground" />
              </div>
              <div className="flex items-center gap-2 rounded-(--radius-field) border border-black/[0.06] bg-[var(--brand-wash)]/50 px-3 py-2.5">
                <LockKeyhole className="size-4 text-primary" />
                <span className="text-xs font-bold text-[var(--brand-ink)]">Short-lived signed links</span>
                <span className="ml-auto text-[11px] font-semibold text-emerald-600">Expiring</span>
              </div>
            </div>
          </RevealItem>

          {/* Privacy-first */}
          <RevealItem className={CARD}>
            <span className="vela-icon-tile ring-1 ring-primary/10">
              <ShieldCheck className="size-5" />
            </span>
            <h3 className="mt-5 text-base font-bold text-[var(--brand-ink)]">Built privacy-first</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Privacy safeguards are part of the product, built in from day one — not bolted on later.
            </p>
            <div className="mt-5 space-y-2">
              <div className="flex items-center gap-2 rounded-(--radius-field) border border-black/[0.06] bg-[var(--brand-wash)]/50 px-3 py-2.5">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
                  <ShieldCheck className="size-3.5" />
                  Privacy built in
                </span>
                <span className="ml-auto text-[11px] font-semibold text-muted-foreground">From day one</span>
              </div>
              <div className="flex items-center gap-2 rounded-(--radius-field) border border-black/[0.06] bg-[var(--brand-wash)]/50 px-3 py-2.5">
                <ShieldCheck className="size-4 text-primary" />
                <span className="text-xs font-bold text-[var(--brand-ink)]">Audit-ready access</span>
                <span className="ml-auto text-[11px] font-semibold text-muted-foreground">By design</span>
              </div>
            </div>
          </RevealItem>
        </RevealGroup>
      </div>
    </section>
  );
}
