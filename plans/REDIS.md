# Redis for Vela — Research & Analysis

> Broad research (June 2026) on what Redis is, its full capability surface, what
> teams actually use it for, the serverless reality of our stack, and a
> capability-by-capability verdict for Vela/Clinicare. Sources listed at the end.
>
> **Headline:** for *our* app, caching is **not** where Redis pays off first.
> Our scaling risks were unbounded queries + missing indexes (already fixed), our
> heaviest data is PHI (which you don't want in a third-party cache without a
> BAA), and Vercel already gives us a CDN + Data Cache for free. The two genuinely
> high-value Redis uses for Vela are **(1) global rate limiting** and **(2) a
> serverless queue/scheduler (Upstash QStash) for reliable, sub-daily reminders
> and outbound messaging** — the latter directly removes the Vercel-Hobby daily-
> cron limit we just hit and adds retries.

---

## 1. What Redis is

An in-memory data-structure store used as a **cache, database, message broker, and queue**. Sub-millisecond reads/writes because data lives in RAM. Commands execute on a single thread, so individual operations are **atomic** (no app-side locking needed for counters, dedup, etc.). Persistence is optional (snapshot/append-only), TTL/expiry is first-class, and it's far more than key→value — it ships ~a dozen specialized data structures.

## 2. The full capability surface (what it offers)

**Data structures:** strings, hashes, lists, sets, **sorted sets (ZSET)**, bitmaps, **HyperLogLog** (probabilistic unique counts), **geospatial** indexes, **streams** (append-only log + consumer groups), plus module types: **JSON**, **vector/search** (Redis Query Engine), probabilistic (Bloom/Cuckoo/Count-Min/Top-K), and time-series.

**Mechanisms:** TTL/expiry, atomic ops, **Lua scripting / functions**, transactions (MULTI/EXEC), **pub/sub**, **streams + consumer groups**, keyspace notifications, pipelining, eviction policies (LRU/LFU).

**Operational:** replication, clustering, persistence, encryption in transit/at rest, ACLs/auth.

## 3. What teams most use it for (ranked by real-world prevalence)

1. **Caching** — cache-aside / read-through, with stampede protection. The #1 use, by far.
2. **Rate limiting** — fixed/sliding-window or token-bucket counters with TTL; abuse/DDoS protection. Precise and *global* across instances.
3. **Session storage** — sessions survive restarts/deploys and work across instances (TTL-managed).
4. **Job queues / background jobs** — lists/streams (BullMQ, Sidekiq, Laravel Horizon). On serverless this shifts to an HTTP queue like **Upstash QStash**.
5. **Pub/Sub + Streams (real-time)** — fan-out notifications, event bus, WebSocket broadcast.
6. **Distributed locks + idempotency/dedup** — `SET NX` for "process this once" (webhooks, exactly-once); Redlock for exclusive sections.
7. **Counters & analytics** — sorted sets (leaderboards), HyperLogLog (unique visitors), bitmaps (daily-active users) — sub-ms writes.
8. **Geospatial** — "within N km" lookups (ride-hailing, store locators).
9. **Vector search + LLM semantic caching** — newer: embed queries, return a cached LLM answer when a similar prompt was seen (reportedly 30–80% LLM cost cuts).
10. **Ephemeral tokens / one-time codes** — password-reset nonces, email-verification tokens, OTPs (TTL + `SET NX` = naturally one-time).

## 4. The serverless reality for *our* stack (this reframes everything)

- We're **Next.js on Vercel** (serverless/edge) + **Supabase Postgres**. A traditional TCP Redis client (`ioredis`) is a poor fit on serverless — each invocation opens a connection and you exhaust the pool, exactly like the Postgres pooler problem. The right client is **Upstash Redis** (HTTP/REST, pay-per-request, global, no pooling). **Vercel KV is Upstash under the hood** (now via the Vercel Marketplace).
- **Vercel Cron on Hobby = once-daily, fire-and-forget, no retries, low timeout.** We just hit this (the hourly reminder cron was rejected). **Upstash QStash** is the serverless-native answer: an HTTP message queue + scheduler with **built-in retries and per-message scheduling**, independent of the Vercel plan.
- Next.js already provides **CDN caching + a Data Cache (`unstable_cache`/`revalidate`)** for free on Vercel — so a lot of "add Redis for caching" is already covered without a new provider.

## 5. Capability → Vela verdict

| Redis capability | What it would do for Vela | Verdict |
|---|---|---|
| **Rate limiting** | Make `lib/rate-limit.ts` (today **in-memory, per-instance** → resets every cold start) a **true global** limit across all serverless instances. Non-PHI counters. | **Adopt** (clearest win). `@upstash/ratelimit`, behind the existing seam, with in-memory fallback. Near-term, before US/heavier traffic. |
| **Queue + scheduler (QStash)** | Reliable outbound message + reminder delivery with **retries**, and **sub-daily scheduling without Vercel Pro** — directly fixes the dead 2-hour reminder and the deferred "status-tracked reminder" reliability item. | **Strong candidate** — fold into the messaging seam (integration Step 2). The standout non-caching find for us. |
| **Idempotency / dedup (`SET NX`)** | Pre-claim key for the Twilio webhook + reminder sends. | **Optional** — Postgres `@unique(providerMessageSid)` + the planned status-tracked `AppointmentReminder` already cover this and keep data in-boundary. Marginal. |
| **Ephemeral one-time tokens** | Store password-reset nonces / email-verification / OTP with TTL + `SET NX`. Ties directly to the **deferred recovery-marker fix** (forgeable `vela_pw_recovery` cookie → one-time nonce). Non-PHI. | **Useful** — a clean home for one-time nonces; revisit with the recovery-marker hardening at the pre-US gate. |
| **Caching computed aggregates** | Cache Reports/dashboard rollups so heavy computation isn't repeated. | **Prefer Next.js cache** — `unstable_cache`/short-TTL `revalidate` is free, in-boundary, and we already persist `AnalyticsSnapshot` in Postgres. Use Redis only for **non-PHI** cross-instance values. |
| **Caching patient data (records/conversations)** | Big read speedups on client/inbox pages. | **Compliance-gated — not now.** This puts **PHI in a third-party store** → needs an Upstash **BAA (Enterprise tier)** + MFA + Prod Pack + IP allowlist + no public endpoints + PHI-in-values-only. Don't take this on for the pilot. |
| **Pub/Sub real-time inbox** | Replace inbox polling with push. | **Use Supabase Realtime instead** — Redis pub/sub doesn't fit serverless (no persistent subscriber), and we already have Supabase. Skip Redis here. |
| **Semantic LLM cache** | Cache OpenAI analytics by prompt similarity to cut cost. | **Overkill now** — AI runs daily (cron) + manual with a cooldown; cost is low and a rule-based fallback exists. Revisit only if AI volume grows. |
| **Counters / HyperLogLog / bitmaps** | Unique-active-user / daily-active analytics. | **Skip** — Postgres aggregates handle our analytics at clinic scale. |
| **Leaderboards / geospatial / vector** | — | **Skip** — no product surface needs them. |

## 6. The HIPAA gate (the decision that constrains everything)

Storing **PHI** in Redis is a real commitment, not a flag flip. Per Upstash's own healthcare guidance:
- BAA is **Enterprise-tier only** (email `support@upstash.com`).
- Required: **MFA org-wide**, **Prod Pack** (encryption at rest + advanced security), **IP allowlists**, **no public endpoints**, daily backups, **PHI only in values — never in keys/resource names — and never logged**.
- **AWS ElastiCache** is HIPAA-eligible under the AWS BAA (relevant to the AWS-only roadmap), but it's VPC/TCP Redis → doesn't fit Vercel serverless without a proxy.

**Bottom line:** keep **PHI out of Redis** for the pilot. Everything recommended below (rate counters, idempotency keys, one-time nonces, QStash message envelopes that carry only name + time per the minimum-necessary rule) is **non-PHI**, so it sidesteps the BAA entirely.

## 7. Cost & ops

Upstash has a **free tier** (pay-per-request) that comfortably covers pilot volume and scales cheaply; it's one more provider but small ops surface, and it sits behind a seam (swap-friendly, AWS regions available). QStash similarly free/cheap at pilot volume.

## 8. Recommendation — phased

> **Status (2026-06-23): foundation built.** Upstash provisioned via the Vercel
> Marketplace (`KV_REST_API_*` env vars). Added `lib/redis.ts` (client seam),
> `lib/cache.ts` (cache-aside seam with in-memory fallback + tests), and made
> `lib/rate-limit.ts` Redis-backed (`@upstash/ratelimit` sliding window) with the
> in-memory limiter as fallback. Live-verified: raw round-trip PONG/set/get, and
> the limiter correctly tripping (`[true,true,true,false,false]` at limit 3). No
> PHI in Redis. Cache placements attach per real hotspot; rate limiting is live.


- **Now (pilot):** *Don't* add Redis for general/PHI caching — Postgres (now indexed) + Next.js Data Cache already cover our load, and PHI caching is compliance-gated. The two non-PHI, low-risk wins worth doing:
  1. **Redis-backed rate limiting** (`@upstash/ratelimit`) behind `lib/rate-limit.ts`, with graceful in-memory fallback — real abuse protection across instances.
  2. **Adopt QStash in the messaging/reminder integration** (Step 2) — reliable retried delivery + sub-daily scheduling, removing the Vercel-Hobby cron limit and the dead 2-hour reminder.
- **Small optional wins:** one-time reset/verification nonces (with the recovery-marker fix); webhook/reminder idempotency keys.
- **At US / scale:** revisit PHI caching **only behind a BAA**; distributed locks for cron overlap; semantic AI caching if OpenAI cost climbs.
- **Skip:** leaderboards, geospatial, vector, bitmaps/HLL analytics, Redis pub/sub real-time (use Supabase Realtime).

## Sources
- Redis — [What is Redis](https://redis.io/tutorials/what-is-redis/), [Data types](https://redis.io/docs/latest/develop/data-types/), [Distributed locks](https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/), [Data deduplication](https://redis.io/tutorials/data-deduplication-with-redis/)
- Production patterns — [Redis beyond caching: 8 use cases](https://azimmemon2002.github.io/blog/redis-beyond-caching/), [Redis patterns for Node.js](https://dev.to/chengyixu/redis-patterns-for-nodejs-caching-pubsub-and-rate-limiting-in-production-1f4)
- Serverless / Next.js — [Upstash + Next.js complete guide (2026)](https://stacknotice.com/blog/upstash-redis-nextjs-complete-guide-2026), [Edge rate limiting](https://upstash.com/blog/edge-rate-limiting), [Redis caching strategies for Next.js (2025)](https://www.digitalapplied.com/blog/redis-caching-strategies-nextjs-production)
- QStash / scheduling — [QStash announcement](https://upstash.com/blog/qstash-announcement), [Vercel cron alternative](https://dev.to/mike_tickstem/vercel-cron-alternative-what-to-use-when-built-in-cron-isnt-enough-52dp)
- AI / semantic cache — [RedisVL LLM cache](https://docs.redisvl.com/en/latest/user_guide/03_llmcache.html), [Semantic caching cost cuts](https://medium.com/@srajsonu/redis-semantic-caching-cut-your-llm-costs-by-80-with-smarter-cache-hits-8512cdcbb7be)
- HIPAA — [Upstash: managing healthcare data](https://upstash.com/docs/redis/help/managing-healthcare-data), [AWS ElastiCache HIPAA eligible](https://aws.amazon.com/blogs/security/now-you-can-use-amazon-elasticache-for-redis-a-hipaa-eligible-service-to-power-real-time-healthcare-applications/), [Redis PHI handling best practices](https://www.accountablehq.com/post/redis-phi-handling-best-practices-how-to-secure-redis-for-hipaa-compliance)
