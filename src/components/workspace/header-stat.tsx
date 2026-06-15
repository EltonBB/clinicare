import { cn } from "@/lib/utils";

/**
 * One cell of a detail-page header stat strip (the "one divided stat strip"
 * pattern). Shared by the Client and Staff detail headers so the strip stays
 * visually identical across both.
 */
export function HeaderStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "good" | "danger";
}) {
  return (
    <div className="px-4 py-3">
      <p className="text-[10px] font-semibold uppercase leading-3 tracking-[0.1em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1.5 truncate text-xl font-semibold leading-none tracking-tight text-foreground",
          tone === "good" && "text-emerald-700",
          tone === "danger" && "text-destructive"
        )}
      >
        {value}
      </p>
    </div>
  );
}
