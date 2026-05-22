import Link from "next/link";

type CreatePageShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  backHref: string;
  backLabel: string;
  children: React.ReactNode;
};

export function CreatePageShell({
  eyebrow,
  title,
  description,
  backHref,
  backLabel,
  children,
}: CreatePageShellProps) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-5xl flex-col px-1 py-4 sm:py-7">
      <div className="mb-7 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href={backHref} className="font-semibold text-primary transition-colors hover:text-foreground">
          {backLabel}
        </Link>
        <span>/</span>
        <span className="font-semibold text-foreground">new</span>
      </div>

      <div className="mb-7">
        <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-primary">
          {eyebrow}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--brand-ink)] sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-[15px]">
          {description}
        </p>
      </div>

      {children}
    </div>
  );
}
