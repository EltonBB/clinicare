import { PageLoading } from "@/components/page-loading";

/**
 * Loading fallback for every (auth) route. Renders inside the AuthSplitShell form
 * column, so the cobalt brand panel stays put while the form prepares.
 */
export default function AuthLoading() {
  return <PageLoading className="py-10" />;
}
