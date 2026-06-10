# Vela / Clinicare — Roadmap & Migration Plan

> Strategic plan agreed 2026-06-10. This is the durable "where we're going and why" doc.
> `PROJECT_STATUS.md` = what's done. `AGENTS.md` = product direction. This = the forward plan.
> **Note:** not in active execution yet — recorded so it survives across sessions.

---

## 1. Locked decisions (no longer open)

| Topic | Decision |
|---|---|
| **Market** | Free pilot to ~50 **Kosovo** clinics first, then **US-first**. Europe/GDPR is acceptable-to-have but low priority. |
| **Compliance** | **HIPAA is the primary concern** (US market). Build HIPAA-ready from the start. |
| **Host** | **Stay on the current stack now** (Supabase / Vercel / Twilio / OpenAI); **migrate to Azure near the end** as one contained swap. |
| **Why Azure** | $25k Azure credits + one **Microsoft BAA** covers compute + Postgres + storage + email/SMS + AI. Cost is a non-issue for pilot scale (~$150–400/mo). |
| **Sequencing** | Build the product to "done" on the current stack → one Azure swap → QA → compliance gate → first US clinic. |

### Two guardrails (these make the deferred migration safe)
1. **Build HIPAA app-safeguards NOW**, not during the Azure phase. Audit logging, auto-logoff, RBAC, and minimum-necessary messaging are *app work*, not infra work. Retrofitting them after "done" = the expensive trap. Only the **BAA + infrastructure** part waits for Azure.
2. **Build behind seams** so migration is a swap, not a rewrite:
   - Auth → always via `requireCurrentUser()` / `getCurrentWorkspaceContext()`, never raw `@supabase/ssr` in features.
   - Media → always via `lib/media-storage*.ts`.
   - AI → always via `lib/analytics-ai.ts`.
   - Messaging → behind a new `sendMessage(channel, …)` interface from day one.

---

## 2. Messaging channel decisions

| Channel | Pilot (now, current stack) | After Azure migration |
|---|---|---|
| **Email** | **Resend** (best DX; pilot is non-PHI so no BAA needed) | **ACS Email** (BAA-covered) |
| **SMS** | **Reuse existing Twilio** (barely used in Kosovo phase; already wired) | **ACS SMS** (+ optional **RCS** richer-messaging upgrade) |
| **WhatsApp** | **Baileys** (`@whiskeysockets/baileys`) — **Kosovo-only, non-PHI, throwaway**, isolated behind the abstraction | **Official WhatsApp via ACS**, once a US entity + Meta access exist |

**Why these / what was ruled out:**
- **No official WhatsApp without Meta.** Every official route (ACS, Twilio, 360dialog) requires a verified Meta Business account, which is currently unavailable (likely the Kosovo entity; expected to unblock once a US entity exists). So Kosovo WhatsApp uses the unofficial Baileys library — accepted as disposable, ban-prone, **never touches the US or PHI**.
- **iMessage is not buildable** — no business send API; SMS already reaches iPhones. The richer "blue-bubble" experience comes later via **RCS on ACS**.
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

### Step 5 — Azure migration + compliance gate *(finish line)*
- Provision Azure landing zone (Postgres, Blob, Container Apps, ACS, Azure OpenAI, Key Vault, VNet + private endpoints).
- Port behind the seams (DB → Azure Postgres; storage → Blob; AI → Azure OpenAI; messaging → ACS; auth → self-hosted lib on Azure Postgres; cron → Container Apps Jobs).
- **Full QA pass after migration** (auth/session/cron/cold-start differences always surface).
- HIPAA risk assessment + your clinic-facing BAA (counsel-reviewed) → **then** onboard the first US clinic.

---

## 4. Azure swap map (reference for Step 5)

| Current | Azure target | Effort |
|---|---|---|
| Supabase Postgres | Azure Database for PostgreSQL (Flexible Server) | Low — connection string + data copy |
| Supabase Storage | Azure Blob Storage (private, SAS URLs) | Low — one module |
| Supabase Auth (`@supabase/ssr`) | Self-hosted auth (Auth.js / better-auth) on Azure Postgres | **High — the hard part** |
| Vercel hosting | Azure Container Apps (Dockerized Next.js) | Medium |
| Vercel cron (`vercel.json`) | Azure Container Apps Jobs | Low |
| OpenAI | Azure OpenAI (VNet + private endpoints + RBAC) | Low |
| Resend / Twilio messaging | Azure Communication Services (email + SMS) | Low — swap adapter |
| env vars | Azure Key Vault | Low |

---

## 5. HIPAA gate checklist (must clear before the first US clinic)

- [ ] Microsoft BAA accepted on the Azure subscription
- [ ] Twilio BAA (if WhatsApp/SMS still via Twilio) — or fully on ACS
- [ ] Audit logging live across all PHI access paths
- [ ] Auto-logoff / session timeout enforced
- [ ] Role-based / minimum-necessary access verified
- [ ] Minimum-necessary content on all SMS/WhatsApp
- [ ] Formal HIPAA risk assessment completed
- [ ] Clinic-facing BAA drafted + reviewed by counsel
- [ ] PHI confined to BAA-covered services only

> ⚠️ This is an engineering plan, not legal advice. A real HIPAA risk assessment and counsel review are required before handling US PHI.
