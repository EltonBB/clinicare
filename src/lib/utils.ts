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

const HONORIFIC_PATTERN = /^(dr|mr|mrs|ms|prof)\.?$/i

/**
 * First word of a name, skipping a leading honorific (Dr./Mr./Mrs./Ms./Prof.)
 * so greeting copy addresses "Sarah" rather than "Dr." Falls back to the
 * first word itself when every word is a title.
 */
export function firstDisplayName(name: string) {
  const words = name.trim().split(/\s+/)
  return words.find((word) => !HONORIFIC_PATTERN.test(word)) ?? words[0]
}

/**
 * Total length of the union of the given intervals (merges overlapping/
 * touching ranges before summing, so double-booked overlap is only counted
 * once). Unit-agnostic — pass minutes, milliseconds, or any consistent unit.
 * Shared by the Calendar and Reports capacity calculations so both reduce
 * ScheduleBlock overlap the same way.
 */
export function sumMergedIntervals(intervals: Array<{ start: number; end: number }>) {
  const sorted = intervals
    .filter((interval) => interval.end > interval.start)
    .sort((left, right) => left.start - right.start)

  let total = 0
  let mergedStart: number | null = null
  let mergedEnd = 0

  for (const interval of sorted) {
    if (mergedStart === null || interval.start > mergedEnd) {
      if (mergedStart !== null) {
        total += mergedEnd - mergedStart
      }
      mergedStart = interval.start
      mergedEnd = interval.end
    } else {
      mergedEnd = Math.max(mergedEnd, interval.end)
    }
  }

  if (mergedStart !== null) {
    total += mergedEnd - mergedStart
  }

  return total
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
