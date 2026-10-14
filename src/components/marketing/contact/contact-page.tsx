"use client";

import { ArrowRight, ArrowUpRight } from "lucide-react";
import { type FormEvent, useState } from "react";

import { SUPPORT_EMAIL } from "@/lib/public-contact";
import { cn } from "@/lib/utils";
import { MarketingShell } from "../shell/marketing-shell";
import { Reveal } from "../motion/reveal";
import { Highlight, WordReveal } from "../motion/word-reveal";
import { Magnetic } from "../motion/magnetic";

const TOPICS = ["Book a demo", "Pricing question", "Help with setup"];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// No email-sending provider is wired yet (Resend is roadmapped, not built), so
// a mailto: handoff means a visitor's message is never silently discarded,
// with the raw address always visible as a manual fallback.
function buildMailtoHref(fields: { name: string; email: string; clinicName: string; topic: string; message: string }) {
  const subject = `${fields.topic}: ${fields.clinicName || fields.name}`;
  const body = [
    `Name: ${fields.name}`,
    `Email: ${fields.email}`,
    fields.clinicName ? `Clinic / business: ${fields.clinicName}` : null,
    "",
    fields.message,
  ]
    .filter((line) => line !== null)
    .join("\n");
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

const inputClass =
  "h-12 w-full border-0 border-b border-border bg-transparent px-0 text-[15px] text-foreground outline-none transition-[border-color] duration-(--duration-base) ease-out-quint placeholder:text-muted-foreground/60 focus:border-[var(--brand-ink)]";

export function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [clinicName, setClinicName] = useState("");
  const [topic, setTopic] = useState(TOPICS[0]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!name.trim() || !message.trim()) {
      setError("Please add your name and a short message.");
      return;
    }
    if (!EMAIL_PATTERN.test(email.trim())) {
      setError("Please add a valid email so we can reply.");
      return;
    }

    window.location.href = buildMailtoHref({ name: name.trim(), email: email.trim(), clinicName: clinicName.trim(), topic, message: message.trim() });
    setSubmitted(true);
  }

  return (
    <MarketingShell>
      {/* headline and form share the opening; no cards, just type and fields */}
      <section className="pb-24 pt-24 sm:pb-32 sm:pt-32">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-14 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start lg:gap-24 lg:px-8">
          <div className="lg:sticky lg:top-28">
            <h1 className="display-2 text-balance text-[var(--brand-ink)]">
              <WordReveal>
                See how Vela fits <Highlight>your clinic.</Highlight>
              </WordReveal>
            </h1>
            <div className="hero-follow">
              <p className="mt-6 max-w-md text-lg leading-8 text-muted-foreground">
                Ask about setup, workflows, pricing, or moving your process into Vela.
              </p>
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="group/mail mt-10 inline-flex items-center gap-2 text-base font-medium text-[var(--brand-ink)]"
              >
                <span className="relative">
                  {SUPPORT_EMAIL}
                  <span
                    aria-hidden
                    className="absolute inset-x-0 -bottom-0.5 h-px origin-left scale-x-0 bg-primary transition-transform duration-(--duration-slow) ease-out-quint group-hover/mail:scale-x-100"
                  />
                </span>
                <ArrowUpRight className="size-4 text-primary transition-transform duration-(--duration-base) ease-out-quint group-hover/mail:-translate-y-0.5 group-hover/mail:translate-x-0.5" />
              </a>
            </div>
          </div>

          <Reveal delay={0.1}>
            {submitted ? (
              <div className="flex flex-col items-start gap-3 border-t border-border pt-8">
                <h2 className="text-2xl font-semibold tracking-tight text-[var(--brand-ink)]">Your email app should be open.</h2>
                <p className="max-w-md text-[15px] leading-7 text-muted-foreground">
                  The message is ready, so just hit send. Didn&apos;t open?{" "}
                  <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-primary underline underline-offset-4">
                    Email us directly
                  </a>
                  .
                </p>
                <button
                  type="button"
                  onClick={() => setSubmitted(false)}
                  className="mt-2 text-sm font-medium text-muted-foreground underline underline-offset-4 transition-colors hover:text-[var(--brand-ink)]"
                >
                  Write another message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="grid gap-9" noValidate>
                <fieldset>
                  <legend className="text-sm text-muted-foreground">Topic</legend>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {TOPICS.map((option) => {
                      const selected = option === topic;
                      return (
                        <button
                          key={option}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => setTopic(option)}
                          className={cn(
                            "h-9 rounded-full px-4 text-sm font-medium transition-[background-color,color,box-shadow] duration-(--duration-base) ease-out-quint active:scale-[0.97] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/45",
                            selected ? "bg-[var(--brand-ink)] text-white" : "text-muted-foreground ring-1 ring-inset ring-border hover:text-[var(--brand-ink)]",
                          )}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
                <div className="grid grid-cols-1 gap-9 md:grid-cols-2 md:gap-8">
                  <Field label="Name" placeholder="Your name" value={name} onChange={setName} required />
                  <Field label="Email" placeholder="you@clinic.com" type="email" value={email} onChange={setEmail} required />
                </div>
                <Field label="Clinic" placeholder="Clinic or business name (optional)" value={clinicName} onChange={setClinicName} />
                <label className="grid gap-1 text-sm text-muted-foreground">
                  Message
                  <textarea
                    rows={4}
                    required
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="What would you like to know?"
                    className={cn(inputClass, "h-auto resize-none py-3 leading-7")}
                  />
                </label>
                {error ? (
                  <p role="alert" className="text-sm font-medium text-[var(--brand-ink)]">
                    {error}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                  <Magnetic>
                    <button
                      type="submit"
                      className="group/send inline-flex h-12 items-center justify-center gap-2 rounded-(--radius-mkt-field) bg-[var(--brand-ink)] px-6 text-sm font-semibold text-white transition-transform duration-(--duration-base) ease-out-quint active:scale-[0.97] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/45"
                    >
                      Send message
                      <ArrowRight className="size-4 transition-transform duration-(--duration-base) ease-out-quint group-hover/send:translate-x-0.5" />
                    </button>
                  </Magnetic>
                  <p className="text-xs text-muted-foreground">Opens your email app with the message ready.</p>
                </div>
              </form>
            )}
          </Reveal>
        </div>
      </section>
    </MarketingShell>
  );
}

function Field({
  label,
  placeholder,
  type = "text",
  value,
  onChange,
  required,
}: {
  label: string;
  placeholder: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1 text-sm text-muted-foreground">
      {label}
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
      />
    </label>
  );
}
