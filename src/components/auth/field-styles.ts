/**
 * Shared field styling for the auth forms. Centralized so the login / sign-up /
 * forgot / reset inputs stay identical: a faint wash at rest that turns white
 * with a soft cobalt halo on focus, animated (the Input primitive's focus state
 * is otherwise instant).
 */
export const authFieldClassName =
  "h-12 rounded-(--radius-field) border-border/80 bg-[var(--brand-wash)]/40 px-4 text-[15px] shadow-none transition-[border-color,box-shadow,background-color] duration-(--duration-base) ease-out-quint placeholder:text-muted-foreground/60 hover:border-border focus-visible:border-primary/60 focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-primary/10";
