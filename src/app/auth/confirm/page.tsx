import { Suspense } from "react";

import { AuthConfirmScreen } from "@/components/auth/auth-confirm-screen";

export default function AuthConfirmPage() {
  return (
    <Suspense fallback={null}>
      <AuthConfirmScreen />
    </Suspense>
  );
}
