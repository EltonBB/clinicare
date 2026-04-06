import { redirect } from "next/navigation";

import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { getCurrentBusiness } from "@/lib/business";
import {
  isOnboardingCompleted,
  normalizeOnboardingState,
} from "@/lib/onboarding";
import { createClient } from "@/utils/supabase/server";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/onboarding");
  }

  if (!user.email_confirmed_at) {
    redirect(`/confirm-email?email=${encodeURIComponent(user.email ?? "")}`);
  }

  const metadata = user.user_metadata ?? {};
  const business = await getCurrentBusiness(user.id);

  if (isOnboardingCompleted(metadata) && business) {
    redirect("/onboarding/complete");
  }

  const initialState = normalizeOnboardingState(metadata.onboarding_state);
  const businessName =
    typeof metadata.business_name === "string" && metadata.business_name.length > 0
      ? metadata.business_name
      : "Vela Workspace";
  const ownerName =
    typeof metadata.full_name === "string" && metadata.full_name.length > 0
      ? metadata.full_name
      : user.email ?? "Workspace Owner";

  return (
    <OnboardingFlow
      initialState={initialState}
      businessName={businessName}
      ownerName={ownerName}
    />
  );
}
