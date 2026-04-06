import { ArrowUpRight, Sparkles } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function WorkspacePlaceholder({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          {eyebrow}
        </p>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card className="surface-card border-none shadow-none">
          <CardHeader>
            <CardTitle className="text-base">Foundation milestone ready</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm text-muted-foreground">
            <div className="rounded-2xl border border-dashed border-border bg-muted/60 p-5">
              This workspace route and shell are active. The detailed feature
              surface for this section will be built in the next milestone.
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-background p-4">
                <p className="font-medium text-foreground">Responsive shell</p>
                <p className="mt-2 text-sm">
                  Desktop sidebar, top bar, and mobile bottom navigation are in
                  place.
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-background p-4">
                <p className="font-medium text-foreground">Design system</p>
                <p className="mt-2 text-sm">
                  Vela tokens, shadcn primitives, and spacing foundations are
                  installed.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="surface-card border-none shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4 text-primary" />
              Next up
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div className="rounded-2xl bg-muted/60 p-4">
              The next milestone will turn this placeholder into a fully working
              screen with local state or Supabase-backed flows where needed.
            </div>
            <div className="rounded-2xl border border-border bg-background p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium text-foreground">Build target</p>
                <ArrowUpRight className="size-4 text-muted-foreground" />
              </div>
              <p className="mt-2 leading-6">
                Follow the approved milestone order and keep the MVP scoped to
                clinics, salons, and studios.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
