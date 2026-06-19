"use client";

import { CalendarDays, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";
import type { ElementType } from "react";

import { MarketingShell } from "../shell/marketing-shell";
import { InnerHero, Highlight } from "../shared/inner-hero";
import { Reveal } from "../motion/reveal";
import { Magnetic } from "../motion/magnetic";

const methods: { icon: ElementType<{ className?: string }>; title: string; copy: string }[] = [
  { icon: CalendarDays, title: "Book a demo", copy: "Walk through scheduling, records, inbox, and reports." },
  { icon: MessageCircle, title: "Setup questions", copy: "Ask about moving clinic workflows into Vela." },
  { icon: ShieldCheck, title: "Privacy-conscious workflows", copy: "Discuss records, documents, access, and reporting expectations." },
  { icon: Sparkles, title: "Early access", copy: "Share what your clinic needs before online checkout is fully available." },
];

export function ContactPage() {
  return (
    <MarketingShell overlay>
      <InnerHero
        eyebrow="Contact"
        title={
          <>
            See how Vela fits <Highlight>your clinic</Highlight>.
          </>
        }
        copy="Ask about setup, workflows, WhatsApp readiness, reporting, pricing, or moving your current process into Vela."
        primaryHref="/sign-up"
        primaryLabel="Start free"
        secondaryHref="/pricing"
        secondaryLabel="View pricing"
      />

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <Reveal className="vela-night relative overflow-hidden rounded-(--radius-hero) p-6 text-white shadow-[0_28px_90px_rgba(20,21,47,0.2)] sm:p-8">
            <div aria-hidden className="vela-grid-texture pointer-events-none absolute inset-0 opacity-40" />
            <div className="relative">
              <h2 className="display-3 text-white">Let&apos;s talk.</h2>
              <p className="mt-4 max-w-md text-sm leading-7 text-white/65">
                Tell us about your clinic and what you need. We&apos;ll help you see whether Vela is the right fit.
              </p>
              <div className="mt-8 grid gap-4">
                {methods.map(({ icon: Icon, title, copy }) => (
                  <div key={title} className="flex gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-(--radius-field) bg-white/10 text-[#9ec3ff]">
                      <Icon className="size-5" />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-white">{title}</p>
                      <p className="mt-1 text-sm text-white/60">{copy}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.08} className="surface-card p-5 sm:p-8">
            <form className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Full name" placeholder="Your name" />
                <Field label="Email" placeholder="you@example.com" type="email" />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Clinic / business name" placeholder="Your clinic name" />
                <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  How can we help?
                  <select className="h-12 rounded-(--radius-field) border border-border/80 bg-white px-4 text-sm font-semibold normal-case tracking-normal text-foreground outline-none transition-[border-color,box-shadow] duration-(--duration-base) ease-out-quint focus:border-primary/50 focus:ring-3 focus:ring-ring/45">
                    <option>I want to book a demo</option>
                    <option>I have a pricing question</option>
                    <option>I need help with setup</option>
                  </select>
                </label>
              </div>
              <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Message
                <textarea
                  rows={6}
                  placeholder="Tell us about your clinic and what you need..."
                  className="resize-none rounded-(--radius-field) border border-border/80 bg-white px-4 py-3 text-sm font-semibold normal-case tracking-normal text-foreground outline-none transition-[border-color,box-shadow] duration-(--duration-base) ease-out-quint placeholder:text-muted-foreground/70 focus:border-primary/50 focus:ring-3 focus:ring-ring/45"
                />
              </label>
              <Magnetic className="justify-self-start">
                <button
                  type="button"
                  className="vela-gradient inline-flex h-12 items-center justify-center rounded-(--radius-field) px-6 text-sm font-bold text-white shadow-[0_18px_36px_rgba(10,34,255,0.24)] transition-transform duration-(--duration-base) ease-out-quint hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/45"
                >
                  Send message
                </button>
              </Magnetic>
            </form>
          </Reveal>
        </div>
      </section>
    </MarketingShell>
  );
}

function Field({ label, placeholder, type = "text" }: { label: string; placeholder: string; type?: string }) {
  return (
    <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
      {label}
      <input
        type={type}
        placeholder={placeholder}
        className="h-12 rounded-(--radius-field) border border-border/80 bg-white px-4 text-sm font-semibold normal-case tracking-normal text-foreground outline-none transition-[border-color,box-shadow] duration-(--duration-base) ease-out-quint placeholder:text-muted-foreground/70 focus:border-primary/50 focus:ring-3 focus:ring-ring/45"
      />
    </label>
  );
}
