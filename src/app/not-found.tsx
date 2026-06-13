import Link from "next/link";
import { Compass } from "lucide-react";

import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

export default function RootNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="flex max-w-md flex-col items-center gap-4 rounded-(--radius-card) border border-border/80 bg-white px-6 py-10 text-center">
        <span className="flex size-11 items-center justify-center rounded-(--radius-tile) border border-border/75 bg-white text-primary">
          <Compass className="size-5" />
        </span>
        <div className="space-y-1.5">
          <h2 className="text-base font-semibold text-foreground">Page not found</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            The page you&apos;re looking for doesn&apos;t exist or has moved.
          </p>
        </div>
        <Link href="/" className={cn(buttonVariants())}>
          Back to home
        </Link>
      </div>
    </div>
  );
}
