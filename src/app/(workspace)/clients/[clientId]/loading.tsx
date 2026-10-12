import { CLIENT_DETAIL_TAB_COUNT } from "@/lib/skeleton-counts";
import { DetailPageSkeleton } from "@/components/workspace/skeleton";

export default function ClientDetailLoading() {
  return <DetailPageSkeleton tabCount={CLIENT_DETAIL_TAB_COUNT} />;
}
