import Link from "next/link";

import { buttonVariants } from "@/components/ui/button-variants";
import { getI18n } from "@/i18n/server";
import { cn } from "@/lib/utils";

/** A record or page inside the workspace that no longer exists (a stale link, a deleted record). */
export default async function WorkspaceNotFound() {
  const t = (await getI18n()).m.common.errors;
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <h1 className="text-lg font-semibold text-foreground">{t.notFoundTitle}</h1>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {t.notFoundCopy}
        </p>
        <Link href="/dashboard" className={cn(buttonVariants({ size: "sm" }), "mt-5 rounded-(--radius-tile)")}>
          {t.backToDashboard}
        </Link>
      </div>
    </div>
  );
}
