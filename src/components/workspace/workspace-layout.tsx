import Link from "next/link";
import type { ComponentProps, ComponentType, ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
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
};

type WorkspaceToolbarProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

type WorkspaceFormSectionProps = {
  title: ReactNode;
  description?: ReactNode;
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

const pageSizes = {
  default: "mx-auto w-full max-w-[1440px] space-y-3",
  wide: "mx-auto w-full max-w-[1520px] space-y-3",
  full: "w-full max-w-none space-y-3",
  form: "mx-auto w-full max-w-[860px] space-y-3",
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
    <section className={cn("section-reveal border-b border-border/65 pb-2", className)}>
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
}: WorkspaceTableProps) {
  return (
    <section className={cn("overflow-hidden rounded-(--radius-card) border border-border/80 bg-white shadow-(--shadow-card)", className)}>
      {headers ? (
        <div
          className={cn(
            "flex min-h-[40px] items-center border-b border-border/70 bg-[#f8fafc] px-3.5 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground",
            headerClassName
          )}
        >
          {headers}
        </div>
      ) : null}
      <div className={cn("divide-y divide-border/65", bodyClassName)}>{children}</div>
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
  description,
  children,
  className,
  contentClassName,
}: WorkspaceFormSectionProps) {
  return (
    <section className={cn("surface-card p-3.5", className)}>
      <div className="border-b border-border/70 pb-3">
        <h2 className="text-[15px] font-semibold leading-5 text-foreground">{title}</h2>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className={cn("mt-3 space-y-3", contentClassName)}>{children}</div>
    </section>
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
  return (
    <div
      className={cn(
        "rounded-(--radius-card) border border-dashed border-border/80 bg-[#fbfcfe] px-3.5 text-center",
        compact ? "py-2.5" : "py-3.5",
        className
      )}
    >
      {Icon ? (
        <span
          className={cn(
            "mx-auto flex items-center justify-center rounded-(--radius-tile) border border-border/75 bg-white text-primary",
            compact ? "size-8" : "size-9"
          )}
        >
          <Icon className={cn(compact ? "size-3.5" : "size-4")} />
        </span>
      ) : null}
      <p className={cn("text-sm font-semibold text-foreground", Icon && (compact ? "mt-2" : "mt-3"))}>{title}</p>
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
        "inline-flex items-center border border-transparent px-3 py-1.5 text-sm font-medium transition-[background-color,color,border-color] duration-(--duration-base) ease-out-quint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35",
        shape === "pill" ? "rounded-full" : "rounded-(--radius-card)",
        active
          ? "border-border/80 bg-primary/8 text-primary"
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
