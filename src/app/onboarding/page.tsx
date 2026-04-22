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
      : initialState.clinic.name || "Vela Workspace";
  const ownerName =
    typeof metadata.full_name === "string" && metadata.full_name.length > 0
      ? metadata.full_name
      : initialState.owner.name || "Owner name";
  const hydratedInitialState = {
    ...initialState,
    owner: {
      ...initialState.owner,
      name:
        initialState.owner.name ||
        (ownerName === "Owner name" ? "" : ownerName),
    },
    clinic: {
      ...initialState.clinic,
      name:
        initialState.clinic.name ||
        (businessName === "Vela Workspace" ? "" : businessName),
      type:
        initialState.clinic.type ||
        (typeof metadata.business_type === "string" ? metadata.business_type : "Clinic"),
      logoUrl:
        initialState.clinic.logoUrl ||
        (typeof metadata.business_logo_url === "string"
          ? metadata.business_logo_url
          : ""),
      accentColor:
        initialState.clinic.accentColor ||
        (typeof metadata.business_brand_accent === "string"
          ? metadata.business_brand_accent
          : "blue"),
      accentHex:
        initialState.clinic.accentHex ||
        (typeof metadata.business_brand_hex === "string"
          ? metadata.business_brand_hex
          : "#3b82f6"),
    },
  };

  return (
    <OnboardingFlow
      initialState={hydratedInitialState}
      businessName={businessName}
      ownerName={ownerName}
    />
  );
}
