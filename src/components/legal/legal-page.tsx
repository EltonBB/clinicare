import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

export type LegalSection = {
  title: string;
  body: string[];
};

type LegalPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  lastUpdated: string;
  sections: LegalSection[];
};

export function LegalPage({
  eyebrow,
  title,
  description,
  lastUpdated,
  sections,
}: LegalPageProps) {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-4">
          <BrandMark href="/sign-up" />
          <Link
            href="/sign-up"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <ArrowLeft className="size-3.5" />
            Back to Vela
          </Link>
        </header>

        <section className="section-reveal py-10 sm:py-14">
          <div className="rounded-[1.2rem] border border-border/80 bg-white/86 px-5 py-8 shadow-[0_18px_44px_rgba(20,32,51,0.05)] sm:px-8 sm:py-10">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {eyebrow}
              </p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                {title}
              </h1>
              <p className="mt-5 text-base leading-8 text-muted-foreground">
                {description}
              </p>
              <p className="mt-5 text-sm font-medium text-foreground">
                Last updated: {lastUpdated}
              </p>
            </div>
          </div>
        </section>

        <div className="grid gap-5 pb-12 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="h-fit rounded-[1rem] border border-border/80 bg-white/80 p-4 shadow-[0_12px_30px_rgba(20,32,51,0.035)] lg:sticky lg:top-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              In this policy
            </p>
            <nav className="mt-3 space-y-1">
              {sections.map((section) => (
                <a
                  key={section.title}
                  href={`#${slugify(section.title)}`}
                  className="block rounded-[0.7rem] px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {section.title}
                </a>
              ))}
            </nav>
          </aside>

          <article className="space-y-4">
            {sections.map((section) => (
              <section
                key={section.title}
                id={slugify(section.title)}
                className="scroll-mt-8 rounded-[1rem] border border-border/80 bg-white/90 px-5 py-5 shadow-[0_12px_30px_rgba(20,32,51,0.035)] sm:px-6"
              >
                <h2 className="text-xl font-semibold tracking-tight text-foreground">
                  {section.title}
                </h2>
                <div className="mt-3 space-y-3">
                  {section.body.map((paragraph) => (
                    <p
                      key={paragraph}
                      className="text-sm leading-7 text-muted-foreground"
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>
            ))}

            <section className="rounded-[1rem] border border-primary/20 bg-primary/5 px-5 py-5 sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">
                    Questions about these terms?
                  </h2>
                  <p className="mt-1 text-sm leading-7 text-muted-foreground">
                    Contact Vela support for account, privacy, billing, or data
                    requests.
                  </p>
                </div>
                <a
                  href="mailto:support@clinicare-vela.space"
                  className={cn(buttonVariants({ variant: "default", size: "lg" }))}
                >
                  <Mail className="size-4" />
                  Contact support
                </a>
              </div>
            </section>
          </article>
        </div>
      </div>
    </main>
  );
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
