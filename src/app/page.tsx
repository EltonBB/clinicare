import { redirect } from "next/navigation";

import { getCurrentBusiness } from "@/lib/business";
import { isOnboardingCompleted } from "@/lib/onboarding";
import { createClient } from "@/utils/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-up");
  }

  if (!user.email_confirmed_at) {
    redirect(`/confirm-email?email=${encodeURIComponent(user.email ?? "")}`);
  }

  if (!isOnboardingCompleted(user.user_metadata)) {
    redirect("/onboarding");
  }

  const business = await getCurrentBusiness(user.id);

  if (!business) {
    redirect("/onboarding");
  }

  redirect("/dashboard");
}
