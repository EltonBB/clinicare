import { STAFF_DETAIL_TAB_COUNT } from "@/components/staff/staff-details-page";
import { DetailPageSkeleton } from "@/components/workspace/skeleton";

export default function StaffDetailLoading() {
  return <DetailPageSkeleton tabCount={STAFF_DETAIL_TAB_COUNT} />;
}
