"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

type UpgradeModalTriggerProps = {
  label?: string;
  className?: string;
  triggerClassName?: string;
  title?: string;
  description?: string;
};

export function UpgradeModalTrigger({
  label = "Upgrade now",
  triggerClassName,
  className,
}: UpgradeModalTriggerProps) {
  return (
    <Link
      href="/pricing"
      className={cn(
        "inline-flex text-sm font-medium text-primary",
        triggerClassName,
        className
      )}
    >
      {label}
    </Link>
  );
}
