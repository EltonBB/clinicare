"use client";

import { useFormStatus } from "react-dom";
import { ArrowRight, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SubmitButtonProps = {
  children: React.ReactNode;
  pendingLabel: string;
  className?: string;
  variant?: "default" | "solid";
};

export function SubmitButton({
  children,
  pendingLabel,
  className,
  variant = "default",
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      size="lg"
      variant={variant}
      className={cn(
        "group/submit transition-[background-color,transform] duration-(--duration-base) ease-out-quint active:scale-[0.98]",
        variant === "default" && "bg-[var(--brand-ink)] text-white hover:bg-[var(--brand-ink)]/90",
        className,
      )}
      disabled={pending}
    >
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
          {pendingLabel}
        </>
      ) : (
        <>
          {children}
          <ArrowRight className="size-4 transition-transform duration-(--duration-base) ease-out-quint group-hover/submit:translate-x-0.5" data-icon="inline-end" />
        </>
      )}
    </Button>
  );
}
