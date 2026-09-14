import { CLIENT_DIRECTORY_FILTER_COUNT } from "@/lib/skeleton-counts";
import { DirectoryPageSkeleton } from "@/components/workspace/skeleton";

export default function ClientsLoading() {
  return <DirectoryPageSkeleton filterCount={CLIENT_DIRECTORY_FILTER_COUNT} />;
}
