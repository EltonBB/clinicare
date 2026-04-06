"use client";

import { Toaster } from "sonner";

import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      {children}
      <Toaster
        position="top-right"
        richColors
        toastOptions={{
          classNames: {
            toast:
              "rounded-2xl border border-border bg-card text-card-foreground shadow-sm",
          },
        }}
      />
    </TooltipProvider>
  );
}
