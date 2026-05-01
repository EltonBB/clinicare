function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-[1rem] bg-white/72 shadow-[0_18px_42px_rgba(20,32,51,0.04)] ${className}`}
    />
  );
}

export default function WorkspaceLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <SkeletonBlock className="h-3 w-32" />
          <SkeletonBlock className="h-10 w-72 max-w-full" />
          <SkeletonBlock className="h-5 w-[28rem] max-w-full" />
        </div>
        <SkeletonBlock className="h-11 w-36" />
      </div>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <SkeletonBlock key={index} className="h-28" />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <SkeletonBlock className="h-[24rem]" />
        <div className="space-y-4">
          <SkeletonBlock className="h-32" />
          <SkeletonBlock className="h-44" />
        </div>
      </div>
    </div>
  );
}
