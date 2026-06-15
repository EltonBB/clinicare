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
