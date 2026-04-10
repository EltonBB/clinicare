import Link from "next/link";
import { BarChart3, Lock, Sparkles } from "lucide-react";

import { UpgradeModalTrigger } from "@/components/upgrade/upgrade-modal-trigger";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

export function ProFeatureLock({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-8">
      <div className="section-reveal space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Reports
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-[2.8rem]">
          {title}
        </h1>
        <p className="max-w-2xl text-base leading-7 text-muted-foreground">
          {description}
        </p>
      </div>

      <section className="section-reveal-delayed rounded-[1.2rem] border border-border/80 bg-white/88 px-6 py-6 shadow-[0_24px_52px_rgba(20,32,51,0.05)]">
        <div className="mx-auto max-w-3xl space-y-6 text-center">
          <div className="mx-auto flex size-16 items-center justify-center rounded-3xl bg-primary/10 text-primary">
            <BarChart3 className="size-7" />
          </div>

          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-muted/40 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <Lock className="size-3.5" />
              Pro feature
            </div>
            <h2 className="text-3xl font-semibold tracking-tight text-foreground">
              Reports unlock on Pro
            </h2>
            <p className="mx-auto max-w-2xl text-sm leading-7 text-muted-foreground">
              Basic keeps the clinic operating system focused on scheduling, clients,
              inbox, and settings. Pro adds reporting and premium workflow surfaces
              when you are ready for deeper visibility.
            </p>
          </div>

          <div className="grid gap-4 rounded-[1rem] border border-border/80 bg-muted/35 p-5 text-left md:grid-cols-2">
            <div className="rounded-[0.95rem] border border-border/80 bg-white/88 p-4">
              <p className="text-sm font-semibold text-foreground">Included on Basic</p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
                <li>Calendar and appointment management</li>
                <li>Client records and conversation history</li>
                <li>Inbox messaging and WhatsApp setup</li>
                <li>Settings, staff, and working hours</li>
              </ul>
            </div>
            <div className="rounded-[0.95rem] border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">Added on Pro</p>
              </div>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
                <li>Reports and weekly performance readouts</li>
                <li>Premium upgrade surfaces and future automation tools</li>
                <li>A cleaner path to deeper insight as the clinic grows</li>
              </ul>
            </div>
          </div>

          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <UpgradeModalTrigger
              label="Unlock Pro"
              triggerClassName={cn(
                buttonVariants({ variant: "default", size: "lg" }),
                "h-11 rounded-[0.9rem] px-5"
              )}
            />
            <Link
              href="/pricing"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-11 rounded-[0.9rem] px-5"
              )}
            >
              View pricing
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
