# Vela / Clinicare — Roadmap & Infrastructure Plan

> Strategic plan agreed 2026-06-10. This is the durable "where we're going and why" doc.
> `PROJECT_STATUS.md` = what's done. `AGENTS.md` = product direction. This = the forward plan.
> **Note:** not in active execution yet — recorded so it survives across sessions.

---

## 1. Locked decisions (no longer open)

| Topic | Decision |
|---|---|
| **Market** | Free pilot to ~50 **Kosovo** clinics first, then **US-first**. Europe/GDPR is acceptable-to-have but low priority. |
| **Compliance** | **HIPAA is the primary concern** (US market). Build HIPAA-ready from the start. |
| **Host** | **AWS indefinitely — no cloud migration.** Stay on the current AWS-backed stack (Supabase / Vercel / Twilio / OpenAI; Supabase + Vercel are AWS-hosted). Provider seams are kept for portability, not for a planned migration. |
| **Why AWS** | Stay on the AWS-backed stack the product already runs on — no migration cost or risk. Cost is a non-issue at pilot scale (~$150–400/mo). **HIPAA note:** with no single cloud BAA, US/PHI coverage means a **BAA with each PHI-handling provider** (Supabase, Vercel, Twilio, production email) — confirm this approach (see §5). |
| **Sequencing** | Build the product to "done" on the current stack → HIPAA compliance gate (BAAs + app safeguards, all on the current stack) → first US clinic. |

### Two guardrails
1. **Build HIPAA app-safeguards NOW.** Audit logging, auto-logoff, RBAC, and minimum-necessary messaging are *app work*, not infra work. Retrofitting them after "done" = the expensive trap. The remaining gate is the **BAA + compliance** work, not an infra migration.
2. **Build behind seams** so any future provider swap is a swap, not a rewrite:
   - Auth → always via `requireCurrentUser()` / `getCurrentWorkspaceContext()`, never raw `@supabase/ssr` in features.
   - Media → always via `lib/media-storage*.ts`.
   - AI → always via `lib/analytics-ai.ts`.
   - Messaging → behind a new `sendMessage(channel, …)` interface from day one.

---

## 2. Messaging channel decisions

| Channel | Pilot (now) | Production / US phase |
|---|---|---|
| **Email** | **Resend** (best DX; pilot is non-PHI so no BAA needed) | **BAA-covered email** for US/PHI — confirm provider (e.g. AWS SES under the AWS BAA) |
| **SMS** | **Reuse existing Twilio** (barely used in Kosovo phase; already wired) | **Twilio with a signed BAA** (Twilio supports HIPAA) |
| **WhatsApp** | **Baileys** (`@whiskeysockets/baileys`) — **Kosovo-only, non-PHI, throwaway**, isolated behind the abstraction | **Official WhatsApp** (via Twilio or another approved BSP), once a US entity + Meta access exist |

**Why these / what was ruled out:**
- **No official WhatsApp without Meta.** Every official route (Twilio, 360dialog, etc.) requires a verified Meta Business account, which is currently unavailable (likely the Kosovo entity; expected to unblock once a US entity exists). So Kosovo WhatsApp uses the unofficial Baileys library — accepted as disposable, ban-prone, **never touches the US or PHI**.
- **iMessage is not buildable** — no business send API; SMS already reaches iPhones. The richer "blue-bubble" experience could come later via **RCS** (through Twilio or another provider).
- **Sent.dm rejected** — no email channel, its WhatsApp/iMessage need the Meta/Apple approvals we lack, and no confirmed BAA. Collapses to "just SMS" for us, which Twilio already covers.

---

## 3. Build order (forward steps)

### Step 1 — Messaging foundation *(first concrete build)*
- Define `sendMessage(channel, payload)` interface + thin provider-adapter layer.
- Adapters: Resend (email), Twilio (SMS), Baileys (WhatsApp, isolated).
- Bake in **minimum-necessary** content rules (name + time; no clinical detail over SMS/WhatsApp).

### Step 2 — Reminder automations
- Wire `lib/reminders.ts` + `/api/cron/reminders` to the messaging layer.
- Connect existing reminder settings (first/second reminder timing, template).

### Step 3 — HIPAA safeguards *(build alongside Steps 1–2)*
- Audit logging of PHI access (who viewed which patient record, when).
- Auto-logoff / session timeout.
- Role-based / minimum-necessary access within a clinic.
- (Encryption in transit/at rest already covered.)

### Step 4 — Finish the product on the current stack
- Billing (Paddle) behind `/checkout`: checkout session, webhooks, plan activation.
- Reusable signed-in test session (unblocks signed-in QA — long-standing blocker).
- UI/UX + performance polish over the completed surface.

### Step 5 — HIPAA compliance gate *(finish line)*
- **No cloud migration** — stay on the current AWS-backed stack (Supabase / Vercel / Twilio / OpenAI).
- Sign a **BAA with every PHI-handling provider** (Supabase, Vercel, Twilio, and the production email provider); confine PHI to BAA-covered services only.
- Verify the Step 3 app safeguards (audit logging, auto-logoff, RBAC, minimum-necessary messaging) are live across all PHI paths.
- HIPAA risk assessment + your clinic-facing BAA (counsel-reviewed) → **then** onboard the first US clinic.

---

## 4. Provider portability (reference)

No cloud migration is planned — the stack stays on AWS-backed providers (Supabase + Vercel are AWS-hosted) indefinitely. The seams from §1 exist so that **if** a single provider ever needs swapping (for a BAA, pricing, or reliability reason), it's a contained adapter change, not a rewrite:

| Seam | Today | Swap effort if ever needed |
|---|---|---|
| Database | Supabase Postgres (via Prisma, `lib/prisma.ts`) | Low — connection string + data copy to another Postgres host (e.g. AWS RDS) |
| Storage | Supabase Storage (`lib/media-storage*.ts`) | Low — one module |
| Auth | Supabase Auth (`@supabase/ssr`) behind `lib/auth.ts` / `lib/business.ts` | **High — the hard part** |
| Hosting / cron | Vercel + `vercel.json` cron | Medium |
| AI | OpenAI (`lib/analytics-ai.ts`) | Low |
| Messaging | Resend / Twilio / Baileys behind `sendMessage()` | Low — swap adapter |

---

## 5. HIPAA gate checklist (must clear before the first US clinic)

- [ ] BAA signed with every PHI-handling provider (Supabase, Vercel, production email)
- [ ] Twilio BAA (for WhatsApp/SMS)
- [ ] Audit logging live across all PHI access paths
- [ ] Auto-logoff / session timeout enforced
- [ ] Role-based / minimum-necessary access verified
- [ ] Minimum-necessary content on all SMS/WhatsApp
- [ ] Formal HIPAA risk assessment completed
- [ ] Clinic-facing BAA drafted + reviewed by counsel
- [ ] PHI confined to BAA-covered services only

> ⚠️ This is an engineering plan, not legal advice. A real HIPAA risk assessment and counsel review are required before handling US PHI.
