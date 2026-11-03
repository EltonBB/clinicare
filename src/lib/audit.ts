import type { AuditActorType } from "@prisma/client";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

/** The parts of a patient's data the audit log tracks. */
export type AuditPart =
  | "client"
  | "appointment"
  | "payment"
  | "document"
  | "galleryItem"
  | "medication"
  | "healthItem"
  | "careNote"
  | "treatmentItem"
  | "followUpReminder"
  | "conversation";

export type AuditVerb = "view" | "create" | "update" | "delete" | "cancel" | "download" | "send";

export type AuditActor = { type: AuditActorType; id: string };

export type AuditEntry = {
  businessId: string;
  actor: AuditActor;
  /** "<part>.<verb>", e.g. "client.view", "payment.update". */
  action: `${AuditPart}.${AuditVerb}`;
  /** The patient whose data it was (null for a chat with an unknown number). */
  clientId: string | null;
  /** The specific record touched, when there is one. */
  recordId?: string | null;
};

/**
 * Records who looked at or changed which patient's data. Ids only, never
 * content. It never throws: a failed write is logged (ids only) and the
 * person's action goes on, because an audit hiccup must not block care.
 */
export async function recordAudit(entries: AuditEntry | readonly AuditEntry[]): Promise<void> {
  const rows = (Array.isArray(entries) ? entries : [entries]).map((entry: AuditEntry) => ({
    businessId: entry.businessId,
    actorType: entry.actor.type,
    actorId: entry.actor.id,
    action: entry.action,
    clientId: entry.clientId,
    recordId: entry.recordId ?? null,
  }));
  if (rows.length === 0) return;
  try {
    await prisma.auditLog.createMany({ data: rows });
  } catch (error) {
    logger.error("Audit log write failed.", error, {
      businessId: rows[0].businessId,
      action: rows[0].action,
      count: rows.length,
    });
  }
}

/** The signed-in owner as an audit actor. */
export function ownerActor(user: { id: string }): AuditActor {
  return { type: "OWNER", id: user.id };
}

/** A staff member using the staff app, as an audit actor. */
export function staffActor(staffMember: { id: string }): AuditActor {
  return { type: "STAFF", id: staffMember.id };
}
