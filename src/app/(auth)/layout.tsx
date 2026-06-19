import { AuthSplitShell } from "@/components/auth/auth-split-shell";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AuthSplitShell>{children}</AuthSplitShell>;
}
