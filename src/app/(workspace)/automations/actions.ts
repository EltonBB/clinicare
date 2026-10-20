"use server";

import type { Business, FollowUpDraftKind, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  AUTOMATIONS,
  automationDefinition,
  defaultAutomationText,
  FOLLOW_UP_KIND_TO_AUTOMATION,
  MAX_AUTOMATION_MESSAGE_LENGTH,
  type AutomationKind,
} from "@/lib/automations";
import { getAutomationSettings } from "@/lib/automations-data";
import { isProBusinessPlan } from "@/lib/billing";
import { getAuthedBusiness } from "@/lib/business";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export type SaveAutomationResult = { ok: true } | { ok: false; error: string };

const PRO_ONLY_ERROR = "Automations beyond the first reminder and thank-you are part of Pro.";
const TRY_AGAIN_ERROR = "Something went wrong. Try again.";

const KINDS = AUTOMATIONS.map((automation) => automation.kind) as [AutomationKind, ...AutomationKind[]];

const templateSchema = z
  .string()
  .trim()
  .max(MAX_AUTOMATION_MESSAGE_LENGTH, `Keep the message under ${MAX_AUTOMATION_MESSAGE_LENGTH} characters.`)
  .nullable();

const saveSchema = z.object({
  kind: z.enum(KINDS),
  enabled: z.boolean(),
  mode: z.enum(["AUTOMATIC", "REVIEW"]),
  timing: z.number().int().nullable(),
  template: templateSchema,
  template2: templateSchema,
});

export type SaveAutomationInput = z.input<typeof saveSchema>;

/** The follow-up draft kinds an automation produces (none for the reminders). */
function draftKindsFor(kind: AutomationKind): FollowUpDraftKind[] {
  return (Object.entries(FOLLOW_UP_KIND_TO_AUTOMATION) as [FollowUpDraftKind, AutomationKind][])
    .filter(([, automation]) => automation === kind)
    .map(([draftKind]) => draftKind);
}

/** An empty box or the default text is stored as null, so it follows the default. */
function storedTemplate(kind: AutomationKind, template: string | null, variant: "moved" | "cancelled") {
  if (!template) return null;
  return template === defaultAutomationText(kind, variant) ? null : template;
}

function revalidateAutomationSurfaces() {
  revalidatePath("/automations");
  revalidatePath("/automations/review");
  revalidatePath("/inbox");
  revalidatePath("/dashboard");
}

const SESSION_EXPIRED = "Your session expired. Log in again to change automations.";

export async function saveAutomationSettingAction(rawInput: SaveAutomationInput): Promise<SaveAutomationResult> {
  const parsed = saveSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? TRY_AGAIN_ERROR };
  }

  const auth = await getAuthedBusiness(SESSION_EXPIRED);
  if ("error" in auth) return { ok: false, error: auth.error };

  return saveForBusiness(auth.business, parsed.data);
}

async function saveForBusiness(
  business: Pick<Business, "id" | "plan">,
  input: z.output<typeof saveSchema>
): Promise<SaveAutomationResult> {
  const businessId = business.id;

  try {
    const current = (await getAutomationSettings(businessId))[input.kind];
    if (!current.available) return { ok: false, error: PRO_ONLY_ERROR };

    const definition = automationDefinition(input.kind);
    let timing: number | null = null;
    if (definition.timingUnit) {
      // An unusual value saved before the options changed stays allowed (withCurrentOption).
      if (input.timing === null || (!definition.timingOptions.includes(input.timing) && input.timing !== current.timing)) {
        return { ok: false, error: "Choose one of the listed times." };
      }
      timing = input.timing;
    }

    // Basic has no review queue and reminders never wait for review (see resolveAutomationSettings).
    const mode = isProBusinessPlan(business.plan) && definition.reviewable ? input.mode : "AUTOMATIC";
    const template = storedTemplate(input.kind, input.template, "moved");
    const template2 = input.kind === "VISIT_CHANGED" ? storedTemplate(input.kind, input.template2, "cancelled") : null;
    await prisma.$transaction(async (tx) => {
      await tx.automationSetting.upsert({
        where: { businessId_kind: { businessId, kind: input.kind } },
        create: { businessId, kind: input.kind, enabled: input.enabled, mode, timing, template, template2 },
        update: { enabled: input.enabled, mode, timing, template, template2 },
      });
      await holdQueuedDrafts(tx, businessId, input.kind, !input.enabled || mode === "REVIEW");
    });
  } catch (error) {
    logger.error("Saving an automation failed.", error, { businessId, kind: input.kind });
    return { ok: false, error: TRY_AGAIN_ERROR };
  }

  revalidateAutomationSurfaces();
  return { ok: true };
}

/**
 * Off hides the automation's pending drafts (automationEnabledWhere) and review
 * hands them to a person. Either way none of the queued ones may then go out on
 * their own — turning it back on or to automatic later must not send a backlog
 * in one burst; only new drafts send by themselves.
 */
async function holdQueuedDrafts(tx: Prisma.TransactionClient, businessId: string, kind: AutomationKind, hold: boolean) {
  const draftKinds = draftKindsFor(kind);
  if (!hold || draftKinds.length === 0) return;
  await tx.followUpDraft.updateMany({
    where: {
      businessId,
      autoSend: true,
      kind: { in: draftKinds },
      // Queued, or claimed by an automatic send that hasn't gone out yet:
      // its last check before sending requires autoSend, so it stops.
      OR: [{ status: "PENDING" }, { status: "SENT", sentAt: null }],
    },
    data: { autoSend: false },
  });
}

/**
 * The card switch. Writes only `enabled`, so a slower switch request can never
 * overwrite timing, wording or mode saved from the editor meanwhile (Codex);
 * the rest is written only when the automation has no saved row yet.
 */
export async function toggleAutomationAction(rawKind: AutomationKind, enabled: boolean): Promise<SaveAutomationResult> {
  const kind = z.enum(KINDS).safeParse(rawKind);
  if (!kind.success || typeof enabled !== "boolean") return { ok: false, error: TRY_AGAIN_ERROR };

  const auth = await getAuthedBusiness(SESSION_EXPIRED);
  if ("error" in auth) return { ok: false, error: auth.error };
  const businessId = auth.business.id;

  try {
    const current = (await getAutomationSettings(businessId))[kind.data];
    if (!current.available) return { ok: false, error: PRO_ONLY_ERROR };

    await prisma.$transaction(async (tx) => {
      await tx.automationSetting.upsert({
        where: { businessId_kind: { businessId, kind: kind.data } },
        create: {
          businessId,
          kind: kind.data,
          enabled,
          mode: current.mode,
          timing: current.timing,
          template: current.template,
          template2: current.template2,
        },
        update: { enabled },
      });
      await holdQueuedDrafts(tx, businessId, kind.data, !enabled);
    });
  } catch (error) {
    logger.error("Switching an automation failed.", error, { businessId, kind: kind.data });
    return { ok: false, error: TRY_AGAIN_ERROR };
  }

  revalidateAutomationSurfaces();
  return { ok: true };
}
