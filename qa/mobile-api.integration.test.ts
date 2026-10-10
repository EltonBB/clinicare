import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// No DB methods, authentication guard, limiter, transaction, or route handler is mocked.
// Only owner identity (for the server action) and framework/telemetry side effects are stubbed.
// Keep the current main app's workspace ownership and action budgets real.
const ownerContext = vi.hoisted(() => ({ ownerId: "" }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => ({ id: ownerContext.ownerId }), requireCurrentUser: async () => ({ id: ownerContext.ownerId }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

let db: PrismaClient;
let pool: Pool;
let routes: Awaited<ReturnType<typeof loadRoutes>>;
let crypto: typeof import("@/lib/staff-auth-crypto");
let fixture: Awaited<ReturnType<typeof seed>>;
let networkAttempts = 0;

async function loadRoutes() {
  const [redeem, me, appointments, appointment, cancel, threads, thread, send, notifications, readNotification, readAll, devices, clock, logout, actions, inbox, readThread, adminInbox] = await Promise.all([
    import("@/app/api/mobile/v1/auth/redeem/route"), import("@/app/api/mobile/v1/me/route"),
    import("@/app/api/mobile/v1/appointments/route"), import("@/app/api/mobile/v1/appointments/[id]/route"),
    import("@/app/api/mobile/v1/appointments/[id]/cancel/route"), import("@/app/api/mobile/v1/threads/route"),
    import("@/app/api/mobile/v1/threads/[id]/route"), import("@/app/api/mobile/v1/threads/[id]/messages/route"),
    import("@/app/api/mobile/v1/notifications/route"), import("@/app/api/mobile/v1/notifications/[id]/read/route"),
    import("@/app/api/mobile/v1/notifications/read-all/route"), import("@/app/api/mobile/v1/devices/route"),
    import("@/app/api/mobile/v1/clock/route"), import("@/app/api/mobile/v1/auth/logout/route"),
    import("@/app/(workspace)/staff/actions"), import("@/lib/mobile/inbox"), import("@/app/api/mobile/v1/threads/[id]/read/route"), import("@/lib/mobile/admin-inbox"),
  ]);
  return { redeem, me, appointments, appointment, cancel, threads, thread, send, notifications, readNotification, readAll, devices, clock, logout, actions, inbox, readThread, adminInbox };
}

function request(route: string, body?: unknown, token = fixture.token, ip = "127.0.0.10") {
  return new Request(`http://127.0.0.1/api/mobile/v1/${route}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-real-ip": ip },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function seed() {
  const a = await db.business.create({ data: { ownerId: "fictional-owner-a", name: "Fictional QA Clinic A", businessType: "QA" } });
  const b = await db.business.create({ data: { ownerId: "fictional-owner-b", name: "Fictional QA Clinic B", businessType: "QA" } });
  ownerContext.ownerId = a.ownerId;
  const staff = await db.staffMember.create({ data: { businessId: a.id, name: "Fictional Doctor A", role: "Doctor" } });
  const peer = await db.staffMember.create({ data: { businessId: a.id, name: "Fictional Peer", role: "Doctor" } });
  const foreign = await db.staffMember.create({ data: { businessId: b.id, name: "Fictional Doctor B", role: "Doctor" } });
  const token = crypto.generateDeviceToken();
  const device = await db.staffDevice.create({ data: { businessId: a.id, staffMemberId: staff.id, tokenHash: crypto.hashDeviceToken(token), expiresAt: new Date(Date.now() + 86_400_000) } });
  const client = await db.client.create({ data: { businessId: a.id, name: "Fictional Patient A", phone: "+00000000001" } });
  const foreignClient = await db.client.create({ data: { businessId: b.id, name: "Fictional Patient B", phone: "+00000000002" } });
  const { getZonedDayWindow } = await import("@/lib/time-zone");
  const startAt = new Date(getZonedDayWindow().start.getTime() + 12 * 3_600_000);
  const endAt = new Date(startAt.getTime() + 1_800_000);
  const ownAppointment = await db.appointment.create({ data: { businessId: a.id, staffMemberId: staff.id, clientId: client.id, title: "Fictional QA visit", startAt, endAt, status: "CONFIRMED" } });
  const peerAppointment = await db.appointment.create({ data: { businessId: a.id, staffMemberId: peer.id, clientId: client.id, title: "Fictional peer visit", startAt, endAt } });
  const foreignAppointment = await db.appointment.create({ data: { businessId: b.id, staffMemberId: foreign.id, clientId: foreignClient.id, title: "Fictional foreign visit", startAt, endAt } });
  const foreignThread = await db.staffThread.create({ data: { businessId: b.id, staffMemberId: foreign.id } });
  const peerThread = await db.staffThread.create({ data: { businessId: a.id, staffMemberId: peer.id } });
  const ownNotification = await db.staffNotification.create({ data: { businessId: a.id, staffMemberId: staff.id, kind: "SYSTEM", title: "QA", body: "Fictional QA notification" } });
  const foreignNotification = await db.staffNotification.create({ data: { businessId: b.id, staffMemberId: foreign.id, kind: "SYSTEM", title: "QA", body: "Fictional foreign notification" } });
  return { a, b, staff, peer, foreign, token, device, ownAppointment, peerAppointment, foreignAppointment, foreignThread, peerThread, ownNotification, foreignNotification };
}

async function seedFutureWaitlist(plan: "BASIC" | "PRO") {
  await db.business.update({ where: { id: fixture.a.id }, data: { plan } });
  // Daytime UTC, two days ahead, avoids dependence on the test's wall-clock hour
  // and stays inside the explicitly configured clinic-local operating hours.
  const startAt = new Date();
  startAt.setUTCDate(startAt.getUTCDate() + 2);
  startAt.setUTCHours(12, 0, 0, 0);
  const endAt = new Date(startAt.getTime() + 1_800_000);
  await db.businessHours.createMany({ data: Array.from({ length: 7 }, (_, weekday) => ({ businessId: fixture.a.id, weekday, startTime: "00:00", endTime: "23:59" })) });
  const appointment = await db.appointment.update({ where: { id: fixture.ownAppointment.id }, data: { startAt, endAt } });
  const waitingClient = await db.client.create({ data: { businessId: fixture.a.id, name: "Fictional waiting patient", phone: "+00000000003" } });
  const entry = await db.waitlistEntry.create({ data: { businessId: fixture.a.id, clientId: waitingClient.id, staffMemberId: fixture.staff.id, service: appointment.title } });
  const foreignEntry = await db.waitlistEntry.create({ data: { businessId: fixture.b.id, clientId: fixture.foreignAppointment.clientId, service: appointment.title } });
  const cancelledClientEntry = await db.waitlistEntry.create({ data: { businessId: fixture.a.id, clientId: appointment.clientId, service: appointment.title } });
  return { appointment, waitingClient, entry, foreignEntry, cancelledClientEntry };
}

beforeAll(async () => {
  const url = new URL(process.env.VELA_QA_DATABASE_URL ?? "http://invalid");
  if (process.env.VELA_QA_FRESH_CLUSTER !== "1" || url.hostname !== "127.0.0.1" || url.port !== "55432" || url.pathname !== "/vela_mobile_qa") {
    throw new Error("Run through the disposable local PostgreSQL harness only.");
  }
  vi.stubGlobal("fetch", async () => { networkAttempts += 1; throw new Error("Provider network is disabled in local database QA."); });
  pool = new Pool({ connectionString: url.toString(), ssl: false, max: 10 });
  db = new PrismaClient({ adapter: new PrismaPg(pool, { disposeExternalPool: true }) });
  // Supply the production Prisma seam's cache with a genuine local PG connection.
  // Only TLS setup differs: this disposable loopback database has no production certificate.
  globalThis.prismaPool = pool;
  globalThis.prisma = db;
  console.info("Local QA: verifying the brand-new database is empty.");
  if (await db.business.count() !== 0) throw new Error("Refusing to reset a populated database.");
  console.info("Local QA: real Prisma query succeeded; loading actual mobile handlers.");
  crypto = await import("@/lib/staff-auth-crypto");
  routes = await loadRoutes();
  console.info("Local QA: actual mobile handlers loaded.");
});

beforeEach(async () => {
  // The guarded fresh cluster contains only this suite's fictional rows.
  await db.business.deleteMany();
  globalThis.rateLimitBuckets?.clear();
  fixture = await seed();
  networkAttempts = 0;
});
afterEach(() => expect(networkAttempts).toBe(0));
afterAll(async () => { vi.unstubAllGlobals(); await db?.$disconnect(); });

describe("actual mobile route handlers with disposable PostgreSQL", () => {
  it("redeems a formatted code once, returns the mobile profile, and stores only a token hash", async () => {
    const code = crypto.generateAccessCode();
    await db.staffAccessCode.create({ data: { businessId: fixture.a.id, staffMemberId: fixture.staff.id, codeHash: crypto.hashAccessCode(code), expiresAt: new Date(Date.now() + 60_000) } });
    const response = await routes.redeem.POST(request("auth/redeem", { code, platform: "ios", deviceLabel: "Fictional QA phone" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.me).toMatchObject({ id: fixture.staff.id, clinicName: fixture.a.name, checkedIn: false, canClock: false });
    const stored = await db.staffDevice.findUniqueOrThrow({ where: { tokenHash: crypto.hashDeviceToken(body.token) } });
    expect(stored.tokenHash).not.toBe(body.token);
    expect((await routes.me.GET(request("me", undefined, body.token))).status).toBe(200);
    expect((await routes.redeem.POST(request("auth/redeem", { code }))).status).toBe(401);
  });

  it("allows only one of five concurrent redemptions to create a device", async () => {
    const code = crypto.generateAccessCode();
    await db.staffAccessCode.create({ data: { businessId: fixture.a.id, staffMemberId: fixture.staff.id, codeHash: crypto.hashAccessCode(code), expiresAt: new Date(Date.now() + 60_000) } });
    const responses = await Promise.all(Array.from({ length: 5 }, (_, i) => routes.redeem.POST(request("auth/redeem", { code }, "", `127.0.0.${20 + i}`))));
    expect(responses.map((r) => r.status).sort()).toEqual([200, 401, 401, 401, 401]);
    expect(await db.staffDevice.count({ where: { staffMemberId: fixture.staff.id } })).toBe(2);
  });

  it("rejects expired codes and inactive staff without issuing devices", async () => {
    const expired = crypto.generateAccessCode();
    await db.staffAccessCode.create({ data: { businessId: fixture.a.id, staffMemberId: fixture.staff.id, codeHash: crypto.hashAccessCode(expired), expiresAt: new Date(Date.now() - 1) } });
    expect((await routes.redeem.POST(request("auth/redeem", { code: expired }))).status).toBe(401);
    const active = crypto.generateAccessCode();
    await db.staffAccessCode.create({ data: { businessId: fixture.a.id, staffMemberId: fixture.staff.id, codeHash: crypto.hashAccessCode(active), expiresAt: new Date(Date.now() + 60_000) } });
    await db.staffMember.update({ where: { id: fixture.staff.id }, data: { isActive: false } });
    expect((await routes.redeem.POST(request("auth/redeem", { code: active }))).status).toBe(401);
    expect(await db.staffDevice.count()).toBe(1);
  });

  it("enforces code issuance supersession under genuine concurrent serializable transactions", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => routes.actions.generateMobileAccessCodeAction(fixture.staff.id)));
    expect(results.some((r) => r.ok)).toBe(true);
    expect(await db.staffAccessCode.count({ where: { staffMemberId: fixture.staff.id, status: "ACTIVE" } })).toBe(1);
    expect(await routes.actions.generateMobileAccessCodeAction(fixture.foreign.id)).toMatchObject({ ok: false });
  });

  it("preserves the current web-owner action budget before generating an enrollment code", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limit");
    for (let i = 0; i < 300; i++) await checkRateLimit(`actions:${fixture.a.ownerId}`, { limit: 300, windowMs: 60_000 });
    expect(await routes.actions.generateMobileAccessCodeAction(fixture.staff.id)).toMatchObject({ ok: false, error: "Too many requests right now. Wait a moment and try again." });
    expect(await db.staffAccessCode.count()).toBe(0);
  });

  it("isolates appointment lists and blocks both same-clinic peers and foreign records", async () => {
    const listed = await (await routes.appointments.GET(request("appointments?offset=0"))).json();
    expect(listed.appointments.map((a: { id: string }) => a.id)).toEqual([fixture.ownAppointment.id]);
    expect(listed.date).toMatchObject({ key: expect.any(String), label: expect.any(String) });
    for (const id of [fixture.peerAppointment.id, fixture.foreignAppointment.id]) {
      expect((await routes.appointment.GET(request(`appointments/${id}`), params(id))).status).toBe(404);
      expect((await routes.cancel.POST(request(`appointments/${id}/cancel`, {}), params(id))).status).toBe(404);
      expect((await db.appointment.findUniqueOrThrow({ where: { id } })).status).toBe("PENDING");
    }
    expect((await routes.appointments.GET(request("appointments?offset=366"))).status).toBe(400);
    expect((await routes.appointments.GET(request("appointments?offset=1.5"))).status).toBe(400);
  });

  it("cancels once with immutable metadata and one notice, and refuses completed/no-show visits", async () => {
    const id = fixture.ownAppointment.id;
    await db.appointmentReminder.create({ data: { appointmentId: id, type: "TWO_HOUR" } });
    expect((await routes.cancel.POST(request(`appointments/${id}/cancel`, {}), params(id))).status).toBe(200);
    const cancelled = await db.appointment.findUniqueOrThrow({ where: { id } });
    expect(cancelled).toMatchObject({ status: "CANCELLED", cancelledAt: expect.any(Date), cancelledScheduledStartAt: fixture.ownAppointment.startAt, reminderGeneration: 1 });
    expect(await db.appointmentReminder.count({ where: { appointmentId: id } })).toBe(0);
    expect((await routes.cancel.POST(request(`appointments/${id}/cancel`, {}), params(id))).status).toBe(200);
    expect(await db.appointment.findUniqueOrThrow({ where: { id } })).toMatchObject({ cancelledAt: cancelled.cancelledAt, cancelledScheduledStartAt: cancelled.cancelledScheduledStartAt, reminderGeneration: 1 });
    expect(await db.staffThreadMessage.count({ where: { sender: "SYSTEM" } })).toBe(1);
    expect(await db.staffNotification.count({ where: { title: "Cancellation sent" } })).toBe(1);
    for (const status of ["COMPLETED", "NO_SHOW"] as const) {
      await db.appointment.update({ where: { id }, data: { status } });
      expect((await routes.cancel.POST(request(`appointments/${id}/cancel`, {}), params(id))).status).toBe(409);
      expect(await db.appointment.findUniqueOrThrow({ where: { id } })).toMatchObject({ status, reminderGeneration: 1, cancelledAt: cancelled.cancelledAt });
    }
    const detail = await (await routes.appointment.GET(request(`appointments/${id}`), params(id))).json();
    expect(detail.appointment.status).toBe("cancelled"); // Current mobile four-status contract.
    expect(await db.staffThreadMessage.count({ where: { sender: "SYSTEM" } })).toBe(1);
    expect(await db.staffNotification.count({ where: { title: "Cancellation sent" } })).toBe(1);
  });

  it("keeps Pro slot matching and draft creation atomic with concurrent mobile cancellations", async () => {
    const { appointment, waitingClient, entry, foreignEntry, cancelledClientEntry } = await seedFutureWaitlist("PRO");
    const responses = await Promise.all(Array.from({ length: 5 }, () => routes.cancel.POST(request(`appointments/${appointment.id}/cancel`, {}), params(appointment.id))));
    expect(responses.map(r => r.status)).toEqual([200, 200, 200, 200, 200]);
    const drafts = await db.followUpDraft.findMany();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ businessId: fixture.a.id, clientId: waitingClient.id, appointmentId: appointment.id, waitlistEntryId: entry.id, kind: "SLOT_OFFER", status: "PENDING", sentAt: null });
    expect(drafts[0].body).toContain(waitingClient.name);
    expect(drafts[0].body).not.toContain(appointment.title);
    expect((await db.waitlistEntry.findUniqueOrThrow({ where: { id: entry.id } })).status).toBe("OFFERED");
    for (const id of [foreignEntry.id, cancelledClientEntry.id]) expect((await db.waitlistEntry.findUniqueOrThrow({ where: { id } })).status).toBe("WAITING");
    expect((await db.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).reminderGeneration).toBe(1);
    expect(await db.staffThreadMessage.count({ where: { sender: "SYSTEM" } })).toBe(1);
    expect(await db.staffNotification.count({ where: { title: "Cancellation sent" } })).toBe(1);
  });

  it("does not create slot-offer drafts on Basic even when an eligible patient is waiting", async () => {
    const { appointment, entry } = await seedFutureWaitlist("BASIC");
    expect((await routes.cancel.POST(request(`appointments/${appointment.id}/cancel`, {}), params(appointment.id))).status).toBe(200);
    expect((await db.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).status).toBe("CANCELLED");
    expect(await db.followUpDraft.count()).toBe(0);
    expect((await db.waitlistEntry.findUniqueOrThrow({ where: { id: entry.id } })).status).toBe("WAITING");
  });

  it("does not draft a Pro slot offer for a future slot outside configured working hours", async () => {
    const { appointment, entry } = await seedFutureWaitlist("PRO");
    await db.businessHours.updateMany({ where: { businessId: fixture.a.id }, data: { isOpen: false } });
    expect((await routes.cancel.POST(request(`appointments/${appointment.id}/cancel`, {}), params(appointment.id))).status).toBe(200);
    expect(await db.followUpDraft.count()).toBe(0);
    expect((await db.waitlistEntry.findUniqueOrThrow({ where: { id: entry.id } })).status).toBe("WAITING");
  });

  it("keeps admin reads side-effect free and isolates thread reads and writes", async () => {
    expect((await routes.thread.GET(request("threads/admin"), params("admin"))).status).toBe(200);
    expect(await db.staffThread.count({ where: { staffMemberId: fixture.staff.id } })).toBe(0);
    for (const id of [fixture.peerThread.id, fixture.foreignThread.id]) {
      expect((await routes.thread.GET(request(`threads/${id}`), params(id))).status).toBe(404);
      expect((await routes.send.POST(request(`threads/${id}/messages`, { body: "Fictional QA message" }), params(id))).status).toBe(404);
    }
    expect(await db.staffThreadMessage.count()).toBe(0);
    expect((await routes.send.POST(request("threads/admin/messages", { body: "x".repeat(4001) }), params("admin"))).status).toBe(400);
    const sent = await routes.send.POST(request("threads/admin/messages", { body: " Fictional QA message " }), params("admin"));
    expect(sent.status).toBe(200);
    expect((await sent.json()).message).toMatchObject({ body: "Fictional QA message" });
    expect(await db.staffThread.count({ where: { staffMemberId: fixture.staff.id } })).toBe(1);
  });

  it("creates only one admin thread under ten concurrent first contacts", async () => {
    const threads = await Promise.all(Array.from({ length: 10 }, () => routes.inbox.ensureAdminThread(fixture.a.id, fixture.staff.id)));
    expect(new Set(threads.map((t) => t.id)).size).toBe(1);
    expect(await db.staffThread.count({ where: { staffMemberId: fixture.staff.id } })).toBe(1);
  });

  it("bounds a long conversation and alert history at the route response boundary", async () => {
    const thread = await routes.inbox.ensureAdminThread(fixture.a.id, fixture.staff.id);
    await db.staffThreadMessage.createMany({ data: Array.from({ length: 110 }, (_, i) => ({ threadId: thread.id, sender: "ADMIN" as const, body: `Fictional QA message ${i}`, createdAt: new Date(Date.now() - (110 - i) * 1000) })) });
    await db.staffNotification.createMany({ data: Array.from({ length: 55 }, (_, i) => ({ businessId: fixture.a.id, staffMemberId: fixture.staff.id, kind: "SYSTEM" as const, title: "QA", body: `Fictional QA alert ${i}` })) });
    const conversation = await (await routes.thread.GET(request("threads/admin"), params("admin"))).json();
    expect(conversation.conversation.messages).toHaveLength(100);
    expect(conversation.conversation.messages[0].body).toBe("Fictional QA message 10");
    const alerts = await (await routes.notifications.GET(request("notifications"))).json();
    expect(alerts.notifications).toHaveLength(50);
  });

  it("acknowledges only the fetched message IDs and preserves a later ADMIN arrival", async () => {
    const thread = await routes.inbox.ensureAdminThread(fixture.a.id, fixture.staff.id);
    const visible = await db.staffThreadMessage.create({ data: { threadId: thread.id, sender: "ADMIN", body: "Fictional visible" } });
    await db.staffThread.update({ where: { id: thread.id }, data: { unreadForStaff: 1 } });
    const snapshot = await (await routes.thread.GET(request("threads/admin"), params("admin"))).json();
    const unseen = await db.staffThreadMessage.create({ data: { threadId: thread.id, sender: "ADMIN", body: "Fictional unseen", createdAt: visible.createdAt } });
    await db.staffThread.update({ where: { id: thread.id }, data: { unreadForStaff: { increment: 1 } } });
    const seenMessageIds = snapshot.conversation.messages.map((m: { id: string }) => m.id);
    for (let i = 0; i < 2; i++) expect(await (await routes.readThread.POST(request("threads/admin/read", { seenMessageIds }), params("admin"))).json()).toEqual({ ok: true, unreadCount: 1 });
    expect((await db.staffThreadMessage.findUniqueOrThrow({ where: { id: visible.id } })).readAt).not.toBeNull();
    expect((await db.staffThreadMessage.findUniqueOrThrow({ where: { id: unseen.id } })).readAt).toBeNull();
    expect(await (await routes.readThread.POST(request("threads/admin/read", { seenMessageIds: [] }), params("admin"))).json()).toEqual({ ok: true, unreadCount: 1 });
    const legacy = new Request("http://127.0.0.1/api/mobile/v1/threads/admin/read", { method: "POST", headers: { authorization: `Bearer ${fixture.token}` } });
    expect(await (await routes.readThread.POST(legacy, params("admin"))).json()).toEqual({ ok: true, unreadCount: 0 });
  });

  it("rejects malformed, oversized, unknown and foreign read selections without partial writes", async () => {
    const thread = await routes.inbox.ensureAdminThread(fixture.a.id, fixture.staff.id);
    const own = await db.staffThreadMessage.create({ data: { threadId: thread.id, sender: "ADMIN", body: "Fictional own" } });
    const foreign = await db.staffThreadMessage.create({ data: { threadId: fixture.foreignThread.id, sender: "ADMIN", body: "Fictional foreign" } });
    await db.staffThread.update({ where: { id: thread.id }, data: { unreadForStaff: 1 } });
    for (const body of [{ seenMessageIds: [own.id, foreign.id] }, { seenMessageIds: [own.id, "unknown-id"] }, { seenMessageIds: Array(101).fill(own.id) }, { seenMessageIds: [""] }, { seenMessageIds: ["bad/id"] }, {}, null]) {
      expect((await routes.readThread.POST(request("threads/admin/read", body), params("admin"))).status).toBe(400);
    }
    for (const raw of ["{", " "]) {
      const malformed = new Request("http://127.0.0.1/api/mobile/v1/threads/admin/read", { method: "POST", headers: { authorization: `Bearer ${fixture.token}` }, body: raw });
      expect((await routes.readThread.POST(malformed, params("admin"))).status).toBe(400);
    }
    expect((await routes.readThread.POST(request("threads/admin/read", { seenMessageIds: ["x".repeat(33000)] }), params("admin"))).status).toBe(413);
    expect((await routes.readThread.POST(request(`threads/${fixture.foreignThread.id}/read`, { seenMessageIds: [foreign.id] }), params(fixture.foreignThread.id))).status).toBe(404);
    expect(await db.staffThreadMessage.count({ where: { id: { in: [own.id, foreign.id] }, readAt: null } })).toBe(2);
    expect((await db.staffThread.findUniqueOrThrow({ where: { id: thread.id } })).unreadForStaff).toBe(1);
  });

  it("serializes overlapping real admin sends and duplicate read acknowledgments without losing unread", async () => {
    const thread = await routes.inbox.ensureAdminThread(fixture.a.id, fixture.staff.id);
    const seen = await db.staffThreadMessage.create({ data: { threadId: thread.id, sender: "ADMIN", body: "Fictional initially seen" } });
    await db.staffThread.update({ where: { id: thread.id }, data: { unreadForStaff: 1 } });
    const overlapping = await Promise.all([
      ...Array.from({ length: 5 }, () => routes.readThread.POST(request("threads/admin/read", { seenMessageIds: [seen.id] }), params("admin"))),
      ...Array.from({ length: 5 }, (_, i) => routes.adminInbox.postAdminThreadMessage(fixture.a.id, fixture.staff.id, `Fictional concurrent admin ${i}`)),
    ]);
    expect(overlapping.slice(0, 5).every(result => result instanceof Response && result.status === 200)).toBe(true);
    expect(overlapping.slice(5).every(result => "ok" in result && result.ok)).toBe(true);
    expect((await db.staffThread.findUniqueOrThrow({ where: { id: thread.id } })).unreadForStaff).toBe(5);
    expect(await db.staffThreadMessage.count({ where: { threadId: thread.id, sender: "ADMIN", readAt: null } })).toBe(5);
  });

  it("preserves unseen STAFF and SYSTEM messages when the admin acknowledges a fetched snapshot", async () => {
    const thread = await routes.inbox.ensureAdminThread(fixture.a.id, fixture.staff.id);
    await routes.inbox.postSystemMessageToAdminThread(fixture.a.id, fixture.staff.id, "Fictional visible system notice");
    const snapshot = await routes.adminInbox.getAdminThread(fixture.a.id, fixture.staff.id);
    await routes.send.POST(request("threads/admin/messages", { body: "Fictional unseen staff message" }), params("admin"));
    await routes.inbox.postSystemMessageToAdminThread(fixture.a.id, fixture.staff.id, "Fictional unseen system notice");
    const ids = snapshot.messages.map(m => m.id);
    expect(await routes.adminInbox.markAdminThreadRead(fixture.a.id, fixture.staff.id, ids)).toEqual({ ok: true, unreadCount: 2 });
    expect(await routes.adminInbox.markAdminThreadRead(fixture.a.id, fixture.staff.id, ids)).toEqual({ ok: true, unreadCount: 2 });
    expect((await db.staffThread.findUniqueOrThrow({ where: { id: thread.id } })).unreadForAdmin).toBe(2);
    expect(await routes.adminInbox.markAdminThreadRead(fixture.a.id, fixture.staff.id)).toEqual({ ok: true, unreadCount: 0 });
    expect(await db.staffThreadMessage.count({ where: { threadId: thread.id, sender: { in: ["STAFF", "SYSTEM"] }, readAt: null } })).toBe(0);
  });
  it("acknowledges ordinary cancellation SYSTEM receipts without clearing a later cancellation", async () => {
    expect((await routes.cancel.POST(request(`appointments/${fixture.ownAppointment.id}/cancel`, {}), params(fixture.ownAppointment.id))).status).toBe(200);
    const first = await routes.adminInbox.getAdminThread(fixture.a.id, fixture.staff.id);
    expect(first.messages).toHaveLength(1);
    expect(first.messages[0].system).toBe(true);
    const second = await db.appointment.create({ data: { businessId: fixture.a.id, staffMemberId: fixture.staff.id, clientId: fixture.ownAppointment.clientId, title: "Fictional second cancellation", startAt: new Date(), endAt: new Date(Date.now() + 1800000) } });
    expect((await routes.cancel.POST(request(`appointments/${second.id}/cancel`, {}), params(second.id))).status).toBe(200);
    expect(await routes.adminInbox.markAdminThreadRead(fixture.a.id, fixture.staff.id, first.messages.map(m => m.id))).toEqual({ ok: true, unreadCount: 1 });
    expect(await db.staffThreadMessage.count({ where: { threadId: first.threadId, sender: "SYSTEM", readAt: null } })).toBe(1);
    const latest = await routes.adminInbox.getAdminThread(fixture.a.id, fixture.staff.id);
    expect(await routes.adminInbox.markAdminThreadRead(fixture.a.id, fixture.staff.id, latest.messages.map(m => m.id))).toEqual({ ok: true, unreadCount: 0 });
    expect(await db.staffThreadMessage.count({ where: { threadId: first.threadId, readAt: null } })).toBe(0);
  });
  it("lists and marks only the authenticated staff member's notifications", async () => {
    const body = await (await routes.notifications.GET(request("notifications"))).json();
    expect(body.notifications.map((n: { id: string }) => n.id)).toEqual([fixture.ownNotification.id]);
    const foreignId = fixture.foreignNotification.id;
    expect(await (await routes.readNotification.POST(request(`notifications/${foreignId}/read`, {}), params(foreignId))).json()).toEqual({ ok: false });
    await routes.readAll.POST(request("notifications/read-all", {}));
    expect((await db.staffNotification.findUniqueOrThrow({ where: { id: fixture.ownNotification.id } })).readAt).not.toBeNull();
    expect((await db.staffNotification.findUniqueOrThrow({ where: { id: foreignId } })).readAt).toBeNull();
  });

  it("rejects revoked, idle-expired, absolute-expired, and inactive sessions", async () => {
    const day = 86_400_000;
    const states = [
      { revokedAt: new Date(), expiresAt: new Date(Date.now() + day), createdAt: new Date() },
      { revokedAt: null, expiresAt: new Date(Date.now() - 1), createdAt: new Date() },
      { revokedAt: null, expiresAt: new Date(Date.now() + day), createdAt: new Date(Date.now() - 91 * day) },
    ];
    for (const data of states) {
      await db.staffDevice.update({ where: { id: fixture.device.id }, data });
      expect((await routes.me.GET(request("me"))).status).toBe(401);
    }
    await db.staffDevice.update({ where: { id: fixture.device.id }, data: { revokedAt: null, createdAt: new Date(), expiresAt: new Date(Date.now() + day) } });
    await db.staffMember.update({ where: { id: fixture.staff.id }, data: { status: "INACTIVE" } });
    expect((await routes.me.GET(request("me"))).status).toBe(401);
  });

  it("refreshes an active sliding session and permanently rejects its token after logout", async () => {
    await db.staffDevice.update({ where: { id: fixture.device.id }, data: { lastSeenAt: new Date(Date.now() - 2 * 3_600_000) } });
    expect((await routes.me.GET(request("me"))).status).toBe(200);
    const refreshed = await db.staffDevice.findUniqueOrThrow({ where: { id: fixture.device.id } });
    expect(refreshed.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
    expect((await routes.logout.POST(request("auth/logout", {}))).status).toBe(200);
    expect((await db.staffDevice.findUniqueOrThrow({ where: { id: fixture.device.id } })).revokedAt).not.toBeNull();
    expect((await routes.me.GET(request("me"))).status).toBe(401);
  });

  it("bounds request bodies, validates push tokens, and sends finite Retry-After after the device quota", async () => {
    expect((await routes.devices.POST(request("devices", { expoPushToken: "x".repeat(33_000) }))).status).toBe(413);
    expect((await routes.devices.POST(request("devices", { expoPushToken: "invalid" }))).status).toBe(400);
    const push = "ExponentPushToken[fictional_qa_token]";
    expect((await routes.devices.POST(request("devices", { expoPushToken: push }))).status).toBe(200);
    expect((await db.staffDevice.findUniqueOrThrow({ where: { id: fixture.device.id } })).expoPushToken).toBe(push);
    for (let i = 0; i < 17; i++) expect((await routes.devices.POST(request("devices", { expoPushToken: push }))).status).toBe(200);
    const limited = await routes.devices.POST(request("devices", { expoPushToken: push }));
    expect(limited.status).toBe(429);
    const retry = Number(limited.headers.get("Retry-After"));
    expect(Number.isFinite(retry) && retry > 0 && retry <= 60).toBe(true);
  });

  it("enforces the unauthenticated IP budget through the actual me route", async () => {
    for (let i = 0; i < 600; i++) expect((await routes.me.GET(request("me", undefined, "", "127.0.0.99"))).status).toBe(401);
    const limited = await routes.me.GET(request("me", undefined, "", "127.0.0.99"));
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("enforces shift eligibility and one open attendance record under concurrent check-ins", async () => {
    expect((await routes.clock.POST(request("clock", { action: "in" }))).status).toBe(422);
    await db.staffShift.create({ data: { businessId: fixture.a.id, staffMemberId: fixture.staff.id, startsAt: new Date(Date.now() - 3_600_000), endsAt: new Date(Date.now() + 3_600_000) } });
    const responses = await Promise.all(Array.from({ length: 5 }, () => routes.clock.POST(request("clock", { action: "in" }))));
    expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect(await db.staffTimeEntry.count({ where: { staffMemberId: fixture.staff.id, checkedOutAt: null } })).toBe(1);
    expect((await routes.clock.POST(request("clock", { action: "out" }))).status).toBe(200);
    expect(await db.staffTimeEntry.count({ where: { staffMemberId: fixture.staff.id, checkedOutAt: null } })).toBe(0);
  });
});
