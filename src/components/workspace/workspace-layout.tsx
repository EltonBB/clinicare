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

type WorkspaceKpiCardProps = {
  icon?: ComponentType<{ className?: string }>;
  label: string;
  value: ReactNode;
  helper?: ReactNode;
  tone?: "default" | "good" | "warning" | "danger";
  className?: string;
  compact?: boolean;
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

type WorkspaceSectionGridProps = {
  children: ReactNode;
  className?: string;
  columns?: 1 | 2 | 3;
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
  overview: "grid items-start gap-3",
  directory: "grid items-start gap-3",
  detail: "grid items-start gap-3 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)]",
};

const toneStyles = {
  default: "text-muted-foreground",
  good: "text-emerald-600",
  warning: "text-amber-600",
  danger: "text-destructive",
};

const sectionGridColumns = {
  1: "grid-cols-1",
  2: "grid-cols-1 xl:grid-cols-2",
  3: "grid-cols-1 lg:grid-cols-2 xl:grid-cols-3",
};

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
            className="font-semibold text-primary transition-colors hover:text-foreground"
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

export function WorkspaceKpiGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid auto-rows-fr items-stretch gap-3 md:grid-cols-2 xl:grid-cols-4", className)}>
      {children}
    </div>
  );
}

export function WorkspaceKpiCard({
  icon: Icon,
  label,
  value,
  helper,
  tone = "default",
  className,
  compact = false,
}: WorkspaceKpiCardProps) {
  return (
    <section
      className={cn(
        "surface-card flex h-full flex-col justify-between",
        compact ? "min-h-[84px] p-3" : "min-h-[92px] p-3.5",
        className
      )}
    >
      <div className="flex items-start gap-3">
        {Icon ? (
          <span className="vela-icon-tile size-9 rounded-[0.65rem]">
            <Icon className="size-[17px]" />
          </span>
        ) : null}
        <div className="min-w-0">
          <p className="break-words text-[10px] font-semibold uppercase leading-3 tracking-[0.1em] text-muted-foreground">
            {label}
          </p>
          <p
            className={cn(
              "mt-1.5 font-semibold leading-none tracking-tight text-foreground",
            compact ? "text-xl" : "text-[1.38rem]"
            )}
          >
            {value}
          </p>
        </div>
      </div>
      {helper ? (
        <p className={cn(compact ? "mt-1.5 text-[11px]" : "mt-2 text-xs", "font-medium leading-4", toneStyles[tone])}>{helper}</p>
      ) : null}
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
    <section className={cn("overflow-hidden rounded-[0.72rem] border border-border/80 bg-white shadow-[0_3px_10px_rgba(20,32,51,0.018)]", className)}>
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

export function WorkspaceSectionGrid({
  children,
  className,
  columns = 2,
}: WorkspaceSectionGridProps) {
  return (
    <div className={cn("grid items-stretch gap-3", sectionGridColumns[columns], className)}>
      {children}
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
        "rounded-[0.72rem] border border-dashed border-border/80 bg-[#fbfcfe] px-3.5 text-center",
        compact ? "py-2.5" : "py-3.5",
        className
      )}
    >
      {Icon ? (
        <span
          className={cn(
            "mx-auto flex items-center justify-center rounded-[0.65rem] border border-border/75 bg-white text-primary",
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
          className={cn(buttonVariants({ size: "sm" }), compact ? "mt-2.5" : "mt-3", "rounded-[0.65rem]")}
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
