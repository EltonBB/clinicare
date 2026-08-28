# Vela / Clinicare — Roadmap & Infrastructure Plan

> Strategic plan agreed 2026-06-10, revised 2026-08-28 (US market paused). `PROJECT_STATUS.md` = what's done. `AGENTS.md` = product direction. This = the forward plan.
> **Note:** not in active execution yet — recorded so it survives across sessions.

---

## 1. Locked decisions (no longer open)

| Topic | Decision |
|---|---|
| **Market** | Free pilot to ~50 **Kosovo** clinics, then **Balkans/Europe**. **US entry is paused as of 2026-08-28** — not cancelled, just not being scheduled or built toward right now. If it reopens, resume from §3 Step 5 below. |
| **Compliance** | **GDPR is the active regime** — Kosovo's GDPR-aligned law, plus any EU clinic. The HIPAA plan (§3 Step 5, §5) is kept intact for if the US reopens, but nothing should be scheduled or blocked on it while it's paused. |
| **Host** | **AWS indefinitely for the core app — no cloud migration planned.** Supabase + Vercel (both AWS-hosted) run everything except one piece: the WhatsApp worker (`services/whatsapp-worker/`) runs on **Railway — a deliberate, indefinite exception, not a staging step.** Baileys needs an always-on process Vercel's serverless functions can't provide, and Railway is the cost-effective pilot-scale choice for that. It's a portable Docker container (`DEPLOY.md`), so moving it to AWS ECS/Fargate is a low-effort *option* if it's ever worth doing (e.g. consolidating billing, a BAA) — not a scheduled migration. Provider seams elsewhere are kept for portability, not for a planned migration. |
| **Why AWS** | Stay on the stack the product already runs on — no migration cost or risk. Cost is a non-issue at pilot scale (~$150–400/mo). If the US reopens, US/PHI coverage means a **BAA with each PHI-handling provider** (Supabase, Vercel, the SMS/email provider) — see §5. |
| **Sequencing** | Build the product to "done" on the current stack, with the app-level safeguards below built in alongside it, not retrofitted after. |

### Two guardrails
1. **Build the app-level safeguards NOW, regardless of regime.** Audit logging, auto-logoff, RBAC, and minimum-necessary messaging are *app work*, not infra work — and they move GDPR readiness forward today (a full GDPR legal assessment is still outstanding, see §5's disclaimer) while keeping the HIPAA path cheap to resume later. Retrofitting them after "done" is the expensive trap either way.
2. **Build behind seams** so any future provider swap is a swap, not a rewrite:
   - Auth → always via `requireCurrentUser()` / `getCurrentWorkspaceContext()`, never raw `@supabase/ssr` in features.
   - Media → always via `lib/media-storage*.ts`.
   - AI → always via `lib/analytics-ai.ts`.
   - Messaging → behind `sendMessage(channel, …)` — built, see §2.

---

## 2. Messaging channels

| Channel | Current | If the US reopens |
|---|---|---|
| **WhatsApp** | **Baileys** (`@whiskeysockets/baileys`), the only wired channel — Kosovo-only, non-PHI, disposable, isolated behind the `sendMessage()` seam. Confirmed working end-to-end 2026-08-29 (QR-paired, sent + received real messages). | **Official WhatsApp** via Twilio or another approved BSP, once a US entity + Meta access exist. |
| **SMS** | Not wired. Reserved for phone/SMS, never WhatsApp (see CLAUDE.md). | Twilio with a signed BAA (Twilio supports HIPAA). |
| **Email** | **Resend**, configured as Supabase Auth's custom SMTP — handles transactional auth email (signup/reset) today. No application-level email channel adapter exists yet for reminders/marketing. | BAA-covered email for US/PHI — confirm provider (e.g. AWS SES under the AWS BAA, or a BAA with Resend). |

**Why Baileys / what was ruled out:**
- **No official WhatsApp without Meta.** Every official route (Twilio, 360dialog, etc.) requires a verified Meta Business account, currently unavailable (likely the Kosovo entity; expected to unblock once a US entity exists). So Kosovo WhatsApp uses the unofficial Baileys library — accepted as disposable, ban-prone, **never touches the US or PHI**.
- **iMessage is not buildable** — no business send API; SMS already reaches iPhones. The richer "blue-bubble" experience could come later via **RCS** if SMS is ever wired.
- **Sent.dm rejected** — no email channel, its WhatsApp/iMessage need Meta/Apple approvals not available, and no confirmed BAA.

---

## 3. Build order (forward steps)

### Step 1 — Messaging foundation ✅ *(built)*
`sendMessage(channel, payload)` + a thin adapter layer (`lib/messaging/`), with minimum-necessary content baked in (name + time; no clinical detail over SMS/WhatsApp). Baileys is the live adapter.

### Step 2 — Reminder automations ✅ *(built)*
`lib/reminders.ts` + `/api/cron/reminders`, wired to the messaging layer and to the existing reminder settings (timing, template). Hourly cron + distributed lock + fair rotation shipped 2026-08-28/29.

### Step 3 — Patient-data safeguards *(build alongside product work, not gated on a regime)*
- Audit logging of patient-data access (who viewed which record, when).
- Auto-logoff / session timeout.
- Role-based / minimum-necessary access within a clinic.
- (Encryption in transit/at rest already covered.)

### Step 4 — Finish the product on the current stack
- Billing (Paddle) behind `/checkout`: checkout session, webhooks, plan activation.
- Reusable signed-in test session (unblocks signed-in QA — long-standing blocker).
- UI/UX + performance polish over the completed surface.

### Step 5 — HIPAA compliance gate *(paused with the US market — resume only if it reopens)*
- No cloud migration — stay on the current AWS-backed stack.
- Sign a **BAA with every PHI-handling provider** (Supabase, Vercel, the SMS/email provider); confine PHI to BAA-covered services only.
- Verify the Step 3 safeguards are live across all PHI paths.
- Formal HIPAA risk assessment + a clinic-facing BAA (counsel-reviewed) → **then** onboard the first US clinic.

---

## 4. Provider portability (reference)

No cloud migration is planned for the core app — Supabase + Vercel (AWS-hosted) run it indefinitely. The WhatsApp worker's Railway hosting is the one deliberate, accepted exception (see §1's Host row). The seams below exist so that **if** a single provider ever needs swapping (for a BAA, pricing, or reliability reason), it's a contained adapter change, not a rewrite:

| Seam | Today | Swap effort if ever needed |
|---|---|---|
| Database | Supabase Postgres (via Prisma, `lib/prisma.ts`) | Low — connection string + data copy to another Postgres host (e.g. AWS RDS) |
| Storage | Supabase Storage (`lib/media-storage*.ts`) | Low — one module |
| Auth | Supabase Auth (`@supabase/ssr`) behind `lib/auth.ts` / `lib/business.ts` | **High — the hard part** |
| Hosting / cron (app) | Vercel + `vercel.json` cron | Medium |
| Hosting (WhatsApp worker) | Railway, `services/whatsapp-worker/` — a portable Docker container | Low — same image runs on AWS ECS/Fargate unchanged (`DEPLOY.md`) |
| AI | OpenAI (`lib/analytics-ai.ts`) | Low |
| Messaging | Baileys (WhatsApp) behind `sendMessage()`; SMS/email adapters not yet built | Low — swap or add an adapter |

---

## 5. HIPAA gate checklist (paused — only relevant if the US market reopens)

- [ ] BAA signed with every PHI-handling provider (Supabase, Vercel, the SMS/email provider)
- [ ] Audit logging live across all PHI access paths
- [ ] Auto-logoff / session timeout enforced
- [ ] Role-based / minimum-necessary access verified
- [ ] Minimum-necessary content on all SMS/WhatsApp
- [ ] Formal HIPAA risk assessment completed
- [ ] Clinic-facing BAA drafted + reviewed by counsel
- [ ] PHI confined to BAA-covered services only

> ⚠️ This is an engineering plan, not legal advice. A real HIPAA risk assessment and counsel review are required before handling US PHI — and a GDPR-specific review before scaling EU clinics, since Kosovo/GDPR compliance today is engineering best-effort, not a formal legal assessment.
