import { DashboardPageSkeleton } from "@/components/workspace/skeleton";

// The group-root fallback — only ever shown for the brief instant before the
// "/" -> "/dashboard" redirect resolves, so it borrows Dashboard's own
// skeleton (dashboard/loading.tsx) rather than approximating a shape of its
// own.
export default function WorkspaceLoading() {
  return <DashboardPageSkeleton />;
}
