import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Two-letter uppercase initials (first + last name part) for identity tiles.
 * Shared across every avatar surface so initials render consistently.
 */
export function getInitials(name: string) {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ""
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : ""

  return `${first}${last}`.toUpperCase() || name.slice(0, 2).toUpperCase()
}

/**
 * Single source of truth for formatting a cents amount as USD. Pass
 * `{ whole: true }` for compact surfaces (e.g. dashboard KPI tiles) that show
 * rounded whole-dollar amounts; the default keeps two-decimal cent precision.
 */
export function formatCurrency(cents: number, options?: { whole?: boolean }) {
  const amount = cents / 100

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    ...(options?.whole ? { maximumFractionDigits: 0 } : {}),
  }).format(options?.whole ? Math.round(amount) : amount)
}
