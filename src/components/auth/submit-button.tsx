"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

type SubmitButtonProps = {
  children: React.ReactNode;
  pendingLabel: string;
  className?: string;
};

export function SubmitButton({
  children,
  pendingLabel,
  className,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      size="lg"
      className={className}
      disabled={pending}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}
