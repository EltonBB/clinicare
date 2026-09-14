import { CLIENT_DETAIL_TAB_COUNT } from "@/components/clients/client-details-page";
import { DetailPageSkeleton } from "@/components/workspace/skeleton";

export default function ClientDetailLoading() {
  return <DetailPageSkeleton tabCount={CLIENT_DETAIL_TAB_COUNT} />;
}
