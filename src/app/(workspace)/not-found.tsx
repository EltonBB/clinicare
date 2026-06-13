import Link from "next/link";
import { SearchX } from "lucide-react";

import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

export default function WorkspaceNotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="flex max-w-md flex-col items-center gap-4 rounded-(--radius-card) border border-border/80 bg-white px-6 py-10 text-center">
        <span className="flex size-11 items-center justify-center rounded-(--radius-tile) border border-border/75 bg-white text-primary">
          <SearchX className="size-5" />
        </span>
        <div className="space-y-1.5">
          <h2 className="text-base font-semibold text-foreground">We couldn&apos;t find that</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            This record may have been removed, or the link is out of date.
          </p>
        </div>
        <Link href="/dashboard" className={cn(buttonVariants())}>
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
