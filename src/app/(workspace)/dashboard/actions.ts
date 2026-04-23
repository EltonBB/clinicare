"use server";

import { revalidatePath } from "next/cache";

import {
  configurableDashboardWidgetOptions,
  type DashboardWidget,
} from "@/lib/dashboard";
import { prisma } from "@/lib/prisma";
import { requireCurrentBusiness } from "@/lib/business";
import { createClient } from "@/utils/supabase/server";

export type SaveDashboardWidgetsResult = {
  ok: boolean;
  error?: string;
  widgets?: DashboardWidget[];
};

export async function saveDashboardWidgetsAction(
  widgets: DashboardWidget[]
): Promise<SaveDashboardWidgetsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      error: "Your session expired. Log in again to update the dashboard.",
    };
  }

  const business = await requireCurrentBusiness(user, {
    missingBusinessRedirect: "/onboarding",
  });
  const allowed = new Set<DashboardWidget>(configurableDashboardWidgetOptions);
  const normalizedWidgets = widgets.filter((widget, index) => {
    return allowed.has(widget) && widgets.indexOf(widget) === index;
  });
  const nextWidgets = normalizedWidgets;

  await prisma.business.update({
    where: {
      id: business.id,
    },
    data: {
      dashboardFocus: nextWidgets.join(","),
    },
  });

  revalidatePath("/dashboard");

  return {
    ok: true,
    widgets: nextWidgets,
  };
}
