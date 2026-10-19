import Link from "next/link";
import type { ComponentProps, ComponentType, ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

type WorkspacePageProps = ComponentProps<"div"> & {
  children: ReactNode;
  className?: string;
  size?: "default" | "wide" | "form" | "full";
};

type WorkspaceHeaderProps = {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
  meta?: ReactNode;
  backHref?: string;
  backLabel?: string;
  className?: string;
};

type WorkspaceCardProps = {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  compact?: boolean;
  fill?: boolean;
};

type WorkspaceMainGridProps = {
  children: ReactNode;
  className?: string;
  railWidth?: "sm" | "md" | "lg" | "none";
  type?: "overview" | "directory" | "detail";
};

type WorkspaceRailProps = {
  children: ReactNode;
  className?: string;
};

type WorkspaceTableProps = {
  headers?: ReactNode;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  /**
   * The width the table's columns need (e.g. "lg:min-w-[1010px]"). When the
   * card is narrower, the table scrolls sideways instead of clipping its last
   * columns.
   */
  minWidthClassName?: string;
};

type WorkspaceToolbarProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

type WorkspaceFormSectionProps = {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

type WorkspaceEmptyStateProps = {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  actionHref?: string;
  actionLabel?: string;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
};

// Exported so loading.tsx skeletons (skeleton.tsx) can size their wrapper to
// the exact same width instead of retyping these literals — a drifted copy
// silently reintroduces the layout-jump-on-resolve bug class those skeletons
// exist to prevent.
export const pageSizes = {
  default: "mx-auto w-full max-w-[1440px] space-y-3",
  wide: "mx-auto w-full max-w-[1520px] space-y-3",
  full: "w-full max-w-none space-y-3",
  form: "mx-auto w-full max-w-[680px] space-y-3",
};

const mainGridWidths = {
  sm: "xl:grid-cols-[minmax(0,1fr)_260px]",
  md: "xl:grid-cols-[minmax(0,1fr)_292px]",
  lg: "xl:grid-cols-[minmax(0,1fr)_320px]",
  none: "xl:grid-cols-1",
};

const mainGridTypes = {
  overview: "grid grid-cols-1 items-start gap-3",
  directory: "grid grid-cols-1 items-start gap-3",
  detail: "grid grid-cols-1 items-start gap-3 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)]",
};

// Canonical form-control styling — shared so every workspace form/select matches the
// record-dialog reference (h-10, card radius). Inputs use the Input primitive's border/focus;
// native selects need the full border+focus string.
export const fieldInputClass = "h-10 rounded-(--radius-card) bg-white";
export const fieldSelectClass =
  "h-10 w-full rounded-(--radius-card) border border-border/80 bg-white px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] duration-(--duration-base) focus:border-ring focus-visible:ring-3 focus-visible:ring-ring/40";
export const fieldTextareaClass = "min-h-20 rounded-(--radius-card) bg-white px-3 py-2.5";
// Borderless search fields — fully transparent at rest so search blends into
// the toolbar chrome with no visible box, a quiet secondary tint on hover as
// a discoverability cue, and lifts to white only once focused.
export const searchFieldClass =
  "h-10 rounded-(--radius-card) border-0 bg-transparent pl-9 shadow-none transition-colors duration-(--duration-base) hover:bg-secondary/70 focus-visible:bg-white";

export function WorkspacePage({
  children,
  className,
  size = "default",
  ...props
}: WorkspacePageProps) {
  return (
    <div className={cn(pageSizes[size], className)} {...props}>
      {children}
    </div>
  );
}

export function WorkspaceHeader({
  title,
  description,
  eyebrow,
  actions,
  meta,
  backHref,
  backLabel,
  className,
}: WorkspaceHeaderProps) {
  return (
    <section className={cn("section-reveal pb-2", className)}>
      {backHref && backLabel ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link
            href={backHref}
            className="font-semibold text-primary transition-colors duration-(--duration-base) hover:text-foreground"
          >
            {backLabel}
          </Link>
          <span>/</span>
          <span className="font-semibold text-foreground">{title}</span>
        </div>
      ) : null}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="text-[24px] font-semibold leading-[1.08] tracking-tight text-[var(--brand-ink)] sm:text-[27px]">
            {title}
          </h1>
          {description ? (
            <p className="mt-0.5 max-w-3xl text-sm leading-5 text-muted-foreground">
              {description}
            </p>
          ) : null}
          {meta ? <div className="mt-1.5">{meta}</div> : null}
        </div>
        {actions ? (
          <div className="section-reveal-delayed flex flex-wrap items-center gap-2 lg:justify-end">
            {actions}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function WorkspaceMainGrid({
  children,
  className,
  railWidth = "md",
  type = "overview",
}: WorkspaceMainGridProps) {
  return (
    <section className={cn(mainGridTypes[type], type !== "detail" && mainGridWidths[railWidth], className)}>
      {children}
    </section>
  );
}

export function WorkspaceRail({ children, className }: WorkspaceRailProps) {
  return (
    <aside className={cn("section-reveal-delayed grid content-start gap-3", className)}>
      {children}
    </aside>
  );
}

export function WorkspaceCard({
  title,
  description,
  action,
  children,
  className,
  contentClassName,
  compact = false,
  fill = false,
}: WorkspaceCardProps) {
  return (
    <section className={cn("surface-card", fill && "h-full", compact ? "p-3" : "p-3.5", className)}>
      {title || description || action ? (
        <div className="mb-2.5 flex min-h-6 items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? <h2 className="text-[15px] font-semibold leading-5 text-foreground">{title}</h2> : null}
            {description ? (
              <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      <div className={cn("min-w-0", contentClassName)}>{children}</div>
    </section>
  );
}

export function WorkspaceTable({
  headers,
  children,
  className,
  headerClassName,
  bodyClassName,
  minWidthClassName,
}: WorkspaceTableProps) {
  return (
    <section className={cn("overflow-hidden rounded-(--radius-card) border border-border/80 bg-white shadow-(--shadow-card)", className)}>
      <div className={cn(minWidthClassName && "overflow-x-auto")}>
        <div className={minWidthClassName}>
          {headers ? (
            <div
              className={cn(
                "flex min-h-[40px] items-center bg-[#f8fafc] px-3.5 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground",
                headerClassName
              )}
            >
              {headers}
            </div>
          ) : null}
          <div className={cn(bodyClassName)}>{children}</div>
        </div>
      </div>
    </section>
  );
}

export function WorkspaceToolbar({ children, className, contentClassName }: WorkspaceToolbarProps) {
  return (
    <div className={cn("surface-card section-reveal p-3", className)}>
      <div className={cn("flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between", contentClassName)}>
        {children}
      </div>
    </div>
  );
}

export function WorkspaceFormSection({
  title,
  action,
  children,
  className,
  contentClassName,
}: WorkspaceFormSectionProps) {
  return (
    <section className={cn("surface-card p-4", className)}>
      {title ? (
        <div className="mb-3 flex min-h-6 items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold leading-5 text-foreground">{title}</h2>
          {action}
        </div>
      ) : null}
      <div className={cn("space-y-3", contentClassName)}>{children}</div>
    </section>
  );
}

/** The cell shapes a first-run ghost row can draw, matching real row content. */
export type WorkspaceGhostCell = "identity" | "text" | "wide" | "pill" | "action";

type WorkspaceFirstRunProps = {
  title: string;
  description?: string;
  actionHref?: string;
  actionLabel?: string;
  /** The real rows' grid template, so the ghost rows line up with the headers. */
  gridClassName?: string;
  cells?: WorkspaceGhostCell[];
  rows?: number;
  className?: string;
};

const ghostCellClass: Record<WorkspaceGhostCell, string> = {
  identity: "",
  text: "h-2.5 w-20 rounded-full bg-foreground/[0.07]",
  wide: "h-2.5 w-36 rounded-full bg-foreground/[0.07]",
  pill: "h-5 w-16 rounded-full bg-foreground/[0.06]",
  action: "ml-auto h-7 w-16 rounded-(--radius-tile) bg-foreground/[0.05]",
};

// Each ghost row is a little fainter than the one above, so the outline fades
// out instead of ending on a hard edge (no gradient in the workspace).
const ghostRowOpacity = [1, 0.7, 0.45, 0.25, 0.12];

/**
 * What a page shows before it has any records: a few faint rows in the real
 * rows' shapes (no sample data), then one line on what lands here and one
 * action. Used inside a table or list body; the page's own headers and card
 * frame stay, so the empty page already looks like the page it will become.
 */
export function WorkspaceFirstRun({
  title,
  description,
  actionHref,
  actionLabel,
  gridClassName,
  cells = ["identity", "text", "wide", "pill", "action"],
  rows = 4,
  className,
}: WorkspaceFirstRunProps) {
  return (
    <div className={cn("pb-8", className)}>
      <div aria-hidden>
        {Array.from({ length: rows }, (_, row) => (
          <div
            key={row}
            className={cn("grid items-center gap-3 px-3.5 py-2 lg:min-h-[54px]", gridClassName)}
            style={{ opacity: ghostRowOpacity[row] ?? 0.1 }}
          >
            {cells.map((cell, index) =>
              cell === "identity" ? (
                <span key={index} className="flex items-center gap-3">
                  <span className="size-8 shrink-0 rounded-(--radius-tile) bg-foreground/[0.06]" />
                  <span className="h-2.5 w-28 rounded-full bg-foreground/[0.08]" />
                </span>
              ) : (
                <span key={index} className={cn("hidden lg:block", ghostCellClass[cell])} />
              )
            )}
          </div>
        ))}
      </div>
      <div className="mx-auto mt-2 max-w-sm px-4 text-center">
        <p className="text-[15px] font-semibold text-foreground">{title}</p>
        {description ? <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p> : null}
        {actionHref && actionLabel ? (
          <Link href={actionHref} className={cn(buttonVariants({ size: "sm" }), "mt-4 rounded-(--radius-tile)")}>
            {actionLabel}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function WorkspaceEmptyState({
  icon: Icon,
  title,
  description,
  actionHref,
  actionLabel,
  action,
  className,
  compact = false,
}: WorkspaceEmptyStateProps) {
  // A quiet muted panel: no dashed slot, and the icon is a small glyph rather
  // than a bordered badge (AGENTS.md visual law 7).
  return (
    <div
      className={cn(
        "rounded-(--radius-card) bg-muted/60 px-3.5 text-center",
        compact ? "py-3" : "py-4",
        className
      )}
    >
      {Icon ? <Icon className={cn("mx-auto text-muted-foreground", compact ? "size-4" : "size-[18px]")} /> : null}
      <p className={cn("text-sm font-semibold text-foreground", Icon && "mt-2")}>{title}</p>
      {description ? (
        <p className={cn("mx-auto mt-1 max-w-sm text-sm text-muted-foreground", compact ? "leading-5" : "leading-5")}>
          {description}
        </p>
      ) : null}
      {action ? <div className={cn(compact ? "mt-2.5" : "mt-3")}>{action}</div> : null}
      {actionHref && actionLabel ? (
        <Link
          href={actionHref}
          className={cn(buttonVariants({ size: "sm" }), compact ? "mt-2.5" : "mt-3", "rounded-(--radius-tile)")}
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

type FilterChipProps = {
  active?: boolean;
  count?: number;
  shape?: "chip" | "pill";
  onClick?: () => void;
  children: ReactNode;
  className?: string;
};

// Shared filter/segment chip — one recipe across Clients, Staff, and Inbox so the
// "selected" affordance reads identically (active = subtle primary tint, not three dialects).
export function FilterChip({
  active = false,
  count,
  shape = "chip",
  onClick,
  children,
  className,
}: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center px-3 py-1.5 text-sm font-medium transition-[background-color,color] duration-(--duration-base) ease-out-quint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35",
        shape === "pill" ? "rounded-full" : "rounded-(--radius-card)",
        active
          ? "bg-primary/8 text-primary"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
        className
      )}
    >
      {children}
      {typeof count === "number" ? (
        <span
          className={cn(
            "ml-1.5 text-xs font-semibold tabular-nums",
            active ? "text-primary/80" : "text-muted-foreground/80"
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}
