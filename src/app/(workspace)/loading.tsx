import { SkeletonBlock } from "@/components/workspace/skeleton";

// Dashboard-shaped — the fallback for any route below that doesn't define
// its own loading.tsx. Routes with a meaningfully different shape (Calendar,
// Inbox, directories, detail pages, Reports, Settings, forms) each have one.
export default function WorkspaceLoading() {
  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-3.5">
      <div className="flex flex-col gap-3.5 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <SkeletonBlock className="h-3 w-32" />
          <SkeletonBlock className="h-10 w-72 max-w-full" />
          <SkeletonBlock className="h-5 w-[28rem] max-w-full" />
        </div>
        <SkeletonBlock className="h-11 w-36" />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <SkeletonBlock key={index} className="h-[104px]" />
        ))}
      </div>

      <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1fr)_304px]">
        <SkeletonBlock className="h-[20rem]" />
        <div className="space-y-3">
          <SkeletonBlock className="h-28" />
          <SkeletonBlock className="h-36" />
        </div>
      </div>
    </div>
  );
}
