import { AuthSplitShell } from "@/components/auth/auth-split-shell";
import { WithMessages } from "@/i18n/with-messages";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <WithMessages namespaces={["modules"]}>
      <AuthSplitShell>{children}</AuthSplitShell>
    </WithMessages>
  );
}
