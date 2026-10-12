import type { StaffStatus } from "@/lib/staff";
import type { ClientDirectoryFilter } from "@/lib/clients";

// Server-safe source of truth for loading-skeleton counts. Deliberately not
// re-exported from clients-workspace.tsx / staff-workspace.tsx / the detail
// pages — those are "use client" modules, and a route's loading.tsx (a
// Server Component) importing a value from one gets a client reference, not
// the actual number: DirectoryPageSkeleton would receive that reference as
// filterCount and Array.from({ length: filterCount }) would silently render
// no placeholders at all during a suspended navigation (Codex).

export const CLIENT_DIRECTORY_FILTERS: Array<{ label: string; value: ClientDirectoryFilter }> = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
  { label: "Archived", value: "archived" },
  { label: "Attention", value: "attention" },
  { label: "No visits", value: "no-visits" },
];
export const CLIENT_DIRECTORY_FILTER_COUNT = CLIENT_DIRECTORY_FILTERS.length;

export type StaffDirectoryFilter = "all" | StaffStatus | "checked-in";

export const STAFF_DIRECTORY_FILTERS: Array<{ label: string; value: StaffDirectoryFilter }> = [
  { label: "All", value: "all" },
  { label: "Active", value: "ACTIVE" },
  { label: "Away", value: "AWAY" },
  { label: "Inactive", value: "INACTIVE" },
  { label: "Checked in", value: "checked-in" },
];
export const STAFF_DIRECTORY_FILTER_COUNT = STAFF_DIRECTORY_FILTERS.length;

// No backing array — these tabs are literal JSX (<TabsTrigger>), not
// data-driven, so there's nothing to derive a length from. Keep in sync
// with client-details-page.tsx's tabs (Overview, Appointments, Medical
// Info, Documents, Payments) and staff-details-page.tsx's tabs (Overview,
// Schedule, Messages).
export const CLIENT_DETAIL_TAB_COUNT = 5;
export const STAFF_DETAIL_TAB_COUNT = 3;
