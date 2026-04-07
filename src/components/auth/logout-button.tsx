"use client";

import { LogOut } from "lucide-react";

import { logoutAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type LogoutButtonProps = {
  className?: string;
  variant?: "ghost" | "outline";
  fullWidth?: boolean;
  label?: string;
};

export function LogoutButton({
  className,
  variant = "ghost",
  fullWidth = false,
  label = "Log out",
}: LogoutButtonProps) {
  return (
    <form action={logoutAction}>
      <Button
        type="submit"
        variant={variant}
        className={cn(
          "h-10 rounded-[0.85rem] px-3 text-sm shadow-none",
          fullWidth && "w-full justify-start",
          className
        )}
      >
        <LogOut className="size-4" />
        {label}
      </Button>
    </form>
  );
}
