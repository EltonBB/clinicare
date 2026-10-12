import { STAFF_DETAIL_TAB_COUNT } from "@/lib/skeleton-counts";
import { DetailPageSkeleton } from "@/components/workspace/skeleton";

export default function StaffDetailLoading() {
  return <DetailPageSkeleton tabCount={STAFF_DETAIL_TAB_COUNT} />;
}
