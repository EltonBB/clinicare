import { PageLoading } from "@/components/page-loading";

/**
 * App-wide loading fallback shown on navigation/redirect to any route that does
 * not declare its own `loading.tsx` — marketing, legal, checkout, onboarding, and
 * auth (auth also has a shell-matched one). The (workspace) group has its own.
 */
export default function Loading() {
  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center px-6 py-24">
      <PageLoading />
    </div>
  );
}
