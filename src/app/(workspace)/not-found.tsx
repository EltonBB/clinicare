import Link from "next/link";

import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

/** A record or page inside the workspace that no longer exists (a stale link, a deleted record). */
export default function WorkspaceNotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <h1 className="text-lg font-semibold text-foreground">We couldn&apos;t find that</h1>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          This record may have been removed, or the link is out of date.
        </p>
        <Link href="/dashboard" className={cn(buttonVariants({ size: "sm" }), "mt-5 rounded-(--radius-tile)")}>
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
