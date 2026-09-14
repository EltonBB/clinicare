import { STAFF_DIRECTORY_FILTER_COUNT } from "@/components/staff/staff-workspace";
import { DirectoryPageSkeleton } from "@/components/workspace/skeleton";

export default function StaffLoading() {
  return <DirectoryPageSkeleton filterCount={STAFF_DIRECTORY_FILTER_COUNT} />;
}
