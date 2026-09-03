# Capability catalog

> Source of truth for the **capability advisor** (see CLAUDE.md). At the start of a
> substantive task I scan this file and surface any capability that genuinely fits —
> one line: what it'd do, why it fits, who runs it. I suggest freely; I wait for your
> green light before acting. Keep this terse and current — update it whenever a
> skill/tool/MCP is installed or removed.

**Who runs it:** **Me** = I invoke it (acting still waits for your OK) · **You** = you must run it, I can't · **Both** = either.

## Skills — code & advisory

| Skill | What it does | When it's the right call | Who |
|---|---|---|---|
| `improve` | Read-only senior audit → prioritized implementation plans for another agent to execute | Before a sprint/refactor, "where do we take this next", or to generate handoff plans | Both |
| `graphify` | Persistent knowledge graph of the repo; `query` / `path` / `explain` | Architecture questions — "how does X work", "what connects to Y" (`graphify-out/` exists → query first) | Both |
| `ponytail` | Lazy-senior mode: simplest solution, YAGNI, stdlib-first, no unrequested abstractions | While writing code and tempted to over-build | Me |
| `ponytail-review` | Review a diff for over-engineering — one line per cut | Before committing a sizeable diff/PR | Me |
| `ponytail-audit` | Repo-wide over-engineering scan, ranked biggest-cut-first | Periodic cleanup — "what can we delete/simplify" | Me |
| `ponytail-debt` | Collect `ponytail:` shortcut comments into one debt ledger | Only once we adopt `ponytail:` comments (we don't yet) | Me |
| `ponytail-gain` / `ponytail-help` | Scoreboard / reference-card displays | Reference only — low practical value for us | Me |

## Skills — design (surface-dependent — AGENTS.md law)

Marketing may be bold; the authenticated workspace stays calm. **Pick by surface:**

| Skill | What it does | Use on | Who |
|---|---|---|---|
| `emil-design-eng` | Interaction polish, component feel, animation decisions (Emil Kowalski) | **Workspace + marketing** — the calm-safe one | Me |
| `impeccable` | Design / redesign / audit / critique any frontend; uses PRODUCT.md + DESIGN.md | **Any**, incl. workspace audits — calm-safe | Me |
| `design-taste-frontend` | Anti-slop landing pages / portfolios / redesigns | **Marketing only** (its own rule: not dashboards/product UI) | Me |
| `high-end-visual-design` | Awwwards-tier, high-variance agency design | **Marketing only** (would break the calm-workspace law) | Me |
| `redesign-existing-projects` | Audit-first premium upgrade of an existing site | **Marketing** redesigns | Me |

## Skills — Superpowers plugin (obra/superpowers, installed globally 2026-09-03, user scope)

14 skills, ~584 tok always-on per session (auto-injected via a `SessionStart` hook — read its source, it only prints its own `using-superpowers` skill text as context, nothing else). Applies to **every** Claude Code project on this machine, not just clinicare. Full writeup: memory `superpowers-skill-plugin`.

| Skill | What it does | When it's the right call | Who |
|---|---|---|---|
| `systematic-debugging` | 4-phase root-cause debugging | Non-obvious bug — no equivalent exists in this repo | Me |
| `brainstorming` | Socratic requirements refinement before code | Open-ended/underspecified feature ask, before a plan | Me |
| `verification-before-completion` | Evidence-before-claims gate | Reinforces (doesn't replace) the existing browser-QA "prove it" rule | Me |
| `writing-skills` | Author a new skill correctly | If/when formalizing a project practice (e.g. "fix the class not the line") into a real skill | Me |
| `test-driven-development` | RED-GREEN-REFACTOR, test before implementation | Selectively, for new pure-logic modules — we have a real Vitest suite to write into. Not a strict mandate: UI/integration work still relies on manual browser QA, not test-first | Me |
| `requesting-code-review` / `receiving-code-review` / `finishing-a-development-branch` | Generic review + merge workflow | **Don't** — `/code-review`, `/ponytail-review`, the Codex loop, and explicit merge-on-go-ahead already own this | — |
| `subagent-driven-development` / `dispatching-parallel-agents` | Parallel-agent fan-out | **Don't default to this** — same shape as the token-burn incident that made the CLAUDE.md review loop get rewritten; size effort to risk instead | — |
| `writing-plans` / `executing-plans` / `using-git-worktrees` | Plan authoring, worktree setup | Redundant here — Plan mode + already-worktreed sessions cover this | — |
| `using-superpowers` | Entry-point skill, its own text auto-injected every session start | Not a gate here — its own docs say user/project instructions win, and AGENTS.md/CLAUDE.md are exactly that | — |

## User-only triggers (I cannot launch these)

| Trigger | What it does | When | Who |
|---|---|---|---|
| `/code-review ultra [PR#]` | Multi-agent **cloud** review of the current branch or a GitHub PR; billed | Before merging a significant branch — ask me and I'll flag the moment | You |

## Orchestration & verification (mine — gated by opt-in or your OK)

| Capability | What it does | When | Who |
|---|---|---|---|
| **Workflow** (multi-agent) | Deterministic fan-out of many subagents — audit / migrate / parallel review | Big, parallelizable work — needs your explicit opt-in ("ultracode" / "use a workflow") | Me (on opt-in) |
| Saved: `caresuite-full-review` | The full-codebase review workflow in `.claude/workflows/` | When you want the deferred full review (see the review-plan memory) | Me (on opt-in) |
| **Agent / subagents** | Fan-out search (Explore), planning (Plan), multi-step (general-purpose) | Broad search or plan design without burning main context | Me |
| **preview_*** | Dev-server browser verification (snapshot / console / eval / screenshot) | After previewable UI changes | Me |
| **spawn_task** | Flag out-of-scope work as a background chip | When I spot a tangential fix mid-task | Me |

## MCP servers

| MCP | What it does | When / caveat | Who |
|---|---|---|---|
| **Vercel** | Deployment status, build & runtime logs | After a push — verify the preview/prod deploy | Me |
| **Supabase** | DB schema, logs, advisors | DB debugging — **prod data, read-careful** | Me |
| **Higgsfield media** | Atmospheric image / video generation | Marketing **mood only**; product UI stays code-native. **Credits exhausted — never auto-refill / purchase** | Me |

---
_Last seeded 2026-06-19 — 13 skills installed at `~/.claude/skills/`. Update on install/remove._
_2026-09-03: added the Superpowers plugin (14 more skills, installed via `~/.claude/plugins/`, separate mechanism from the skills above)._
