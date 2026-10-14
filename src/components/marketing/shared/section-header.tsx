import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Reveal } from "../motion/reveal";

/** Left-aligned, two-tone section header: an ink `lead` running into a muted
 *  `rest` in the same sentence, with an optional `aside` pinned right. */
export function SectionHeader({
  lead,
  rest,
  aside,
  className,
}: {
  lead: ReactNode;
  rest?: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <Reveal className={cn("flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between", className)}>
      <h2 className="display-3 max-w-4xl text-balance text-[var(--brand-ink)]">
        {lead}
        {rest ? <span className="text-muted-foreground"> {rest}</span> : null}
      </h2>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </Reveal>
  );
}
