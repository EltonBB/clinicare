import Link from "next/link";
import type { ComponentProps, ComponentType, ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type WorkspacePageProps = ComponentProps<"div"> & {
  children: ReactNode;
  className?: string;
  size?: "default" | "wide" | "form";
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
};

type WorkspaceMainGridProps = {
  children: ReactNode;
  className?: string;
  railWidth?: "sm" | "md" | "lg";
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
  default: "mx-auto w-full max-w-[1440px] space-y-4",
  wide: "mx-auto w-full max-w-[1560px] space-y-4",
  form: "mx-auto w-full max-w-5xl space-y-4",
};

const mainGridWidths = {
  sm: "xl:grid-cols-[minmax(0,1fr)_280px]",
  md: "xl:grid-cols-[minmax(0,1fr)_320px]",
  lg: "xl:grid-cols-[minmax(0,1fr)_380px]",
};

const toneStyles = {
  default: "text-muted-foreground",
  good: "text-emerald-600",
  warning: "text-amber-600",
  danger: "text-destructive",
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
    <section className={cn("section-reveal space-y-3", className)}>
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
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="text-[32px] font-semibold leading-tight tracking-tight text-[var(--brand-ink)] sm:text-[34px]">
            {title}
          </h1>
          {description ? (
            <p className="mt-1.5 max-w-3xl text-[15px] leading-6 text-muted-foreground">
              {description}
            </p>
          ) : null}
          {meta ? <div className="mt-3">{meta}</div> : null}
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
    <div className={cn("grid items-stretch gap-3 md:grid-cols-2 xl:grid-cols-4", className)}>
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
        compact ? "min-h-[96px] p-3.5" : "min-h-[116px] p-4",
        className
      )}
    >
      <div className="flex items-start gap-3">
        {Icon ? (
          <span className="vela-icon-tile size-10 rounded-[0.85rem]">
            <Icon className="size-5" />
          </span>
        ) : null}
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
            {label}
          </p>
          <p
            className={cn(
              "mt-1.5 font-semibold leading-none tracking-tight text-foreground",
              compact ? "text-xl" : "text-2xl"
            )}
          >
            {value}
          </p>
        </div>
      </div>
      {helper ? (
        <p className={cn(compact ? "mt-2 text-[11px]" : "mt-3 text-xs", "font-medium", toneStyles[tone])}>{helper}</p>
      ) : null}
    </section>
  );
}

export function WorkspaceMainGrid({
  children,
  className,
  railWidth = "md",
}: WorkspaceMainGridProps) {
  return (
    <section className={cn("grid items-start gap-4", mainGridWidths[railWidth], className)}>
      {children}
    </section>
  );
}

export function WorkspaceRail({ children, className }: WorkspaceRailProps) {
  return (
    <aside className={cn("section-reveal-delayed grid content-start gap-3.5", className)}>
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
}: WorkspaceCardProps) {
  return (
    <section className={cn("surface-card", compact ? "p-3.5" : "p-4", className)}>
      {title || description || action ? (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? <h2 className="text-base font-semibold text-foreground">{title}</h2> : null}
            {description ? (
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
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
    <section className={cn("overflow-hidden rounded-[1rem] border border-border/80 bg-white/94 shadow-[0_14px_32px_rgba(20,32,51,0.04)]", className)}>
      {headers ? (
        <div
          className={cn(
            "border-b border-border/75 bg-secondary/28 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground",
            headerClassName
          )}
        >
          {headers}
        </div>
      ) : null}
      <div className={cn("divide-y divide-border/70", bodyClassName)}>{children}</div>
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
        "rounded-[0.95rem] border border-dashed border-border/90 bg-white/62 px-4 text-center",
        compact ? "py-3.5" : "py-5",
        className
      )}
    >
      {Icon ? (
        <span
          className={cn(
            "mx-auto flex items-center justify-center rounded-[0.85rem] border border-border/80 bg-white text-primary",
            compact ? "size-8" : "size-10"
          )}
        >
          <Icon className={cn(compact ? "size-3.5" : "size-4")} />
        </span>
      ) : null}
      <p className={cn("text-sm font-semibold text-foreground", Icon && (compact ? "mt-2" : "mt-3"))}>{title}</p>
      {description ? (
        <p className={cn("mx-auto mt-1 max-w-md text-sm text-muted-foreground", compact ? "leading-5" : "leading-6")}>
          {description}
        </p>
      ) : null}
      {action ? <div className={cn(compact ? "mt-3" : "mt-4")}>{action}</div> : null}
      {actionHref && actionLabel ? (
        <Link
          href={actionHref}
          className={cn(buttonVariants({ size: "sm" }), compact ? "mt-3" : "mt-4", "rounded-[0.75rem]")}
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
