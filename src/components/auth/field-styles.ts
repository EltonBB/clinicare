/**
 * Shared field styling for the auth forms. Centralized so the login / sign-up /
 * forgot / reset inputs stay identical, and so the focus border + ring animate
 * in smoothly — the Input primitive's focus state is otherwise instant.
 */
export const authFieldClassName =
  "h-12 rounded-(--radius-field) border-border/80 bg-white px-4 text-[15px] shadow-none transition-[border-color,box-shadow] duration-(--duration-base) ease-out-quint placeholder:text-muted-foreground/70";
