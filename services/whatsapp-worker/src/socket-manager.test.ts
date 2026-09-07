import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  makeSocket: vi.fn(),
  fetchVersion: vi.fn(),
  loadAuth: vi.fn(),
  saveCreds: vi.fn(),
  clearAuth: vi.fn(),
  postToApp: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn() },
}));

vi.mock("baileys", async (importOriginal) => ({
  ...await importOriginal<typeof import("baileys")>(),
  default: mocks.makeSocket,
  fetchLatestBaileysVersion: mocks.fetchVersion,
  makeCacheableSignalKeyStore: (keys: unknown) => keys,
}));
vi.mock("./auth-state", () => ({
  usePostgresAuthState: mocks.loadAuth,
  clearAuthState: mocks.clearAuth,
}));
vi.mock("./bridge", () => ({ postToApp: mocks.postToApp }));
vi.mock("./logger", () => ({ logger: mocks.logger, scrubError: () => "test-error" }));
vi.mock("qrcode-terminal", () => ({ default: { generate: vi.fn() } }));

function makeSocket() {
  return { ev: new EventEmitter(), end: vi.fn(), sendMessage: vi.fn() };
}

// Load the real Baileys parsing helpers once, before per-test lifecycle setup.
let manager = await import("./socket-manager");
let sockets: ReturnType<typeof makeSocket>[];

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  sockets = [];
  mocks.makeSocket.mockImplementation(() => {
    const socket = makeSocket();
    sockets.push(socket);
    return socket;
  });
  mocks.loadAuth.mockResolvedValue({ state: { creds: {}, keys: {} }, saveCreds: mocks.saveCreds });
  mocks.saveCreds.mockResolvedValue(undefined);
  mocks.clearAuth.mockResolvedValue(undefined);
  mocks.postToApp.mockResolvedValue(undefined);
  mocks.fetchVersion.mockResolvedValue({ version: [2, 3000, 1] });
  mocks.logger.child.mockReturnValue(mocks.logger);
  manager = await import("./socket-manager");
});

afterEach(() => {
  manager?.closeAllSessions();
  vi.useRealTimers();
});

describe("socket lifecycle", () => {
  it("coalesces concurrent starts while credentials are loading", async () => {
    let release!: (value: unknown) => void;
    mocks.loadAuth.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
    const first = manager.startSession("business-test");
    await manager.startSession("business-test");

    expect(manager.getStatus("business-test").status).toBe("connecting");
    expect(mocks.loadAuth).toHaveBeenCalledTimes(1);
    expect(mocks.makeSocket).not.toHaveBeenCalled();
    release({ state: { creds: {}, keys: {} }, saveCreds: mocks.saveCreds });
    await first;
    expect(mocks.makeSocket).toHaveBeenCalledTimes(1);
  });

  it("ignores late close and QR events from a replaced socket", async () => {
    await manager.startSession("business-test");
    const old = sockets[0];
    await manager.forceRestartSession("business-test");
    sockets[1].ev.emit("connection.update", { connection: "open" });
    mocks.postToApp.mockClear();

    old.ev.emit("connection.update", { connection: "close" });
    old.ev.emit("connection.update", { qr: "obsolete-qr" });
    await vi.advanceTimersByTimeAsync(60_000);

    expect(manager.getStatus("business-test")).toEqual({ status: "connected", qr: undefined });
    expect(sockets[1].end).not.toHaveBeenCalled();
    expect(mocks.makeSocket).toHaveBeenCalledTimes(2);
    expect(mocks.postToApp).not.toHaveBeenCalled();
  });

  it("cancels pending reconnects and refuses new starts after shutdown", async () => {
    await manager.startSession("business-test");
    sockets[0].ev.emit("connection.update", { connection: "close" });
    expect(manager.getStatus("business-test").status).toBe("connecting");

    manager.closeAllSessions();
    await vi.advanceTimersByTimeAsync(120_000);
    await manager.startSession("another-business");

    expect(mocks.makeSocket).toHaveBeenCalledTimes(1);
    expect(manager.getStatus("business-test").status).toBe("disconnected");
  });
});

describe("inbound forwarding", () => {
  it("forwards a direct reply but ignores groups, broadcasts, own messages and history", async () => {
    await manager.startSession("business-test");
    const direct = {
      key: { id: "message-test", remoteJid: "15550000001@s.whatsapp.net", fromMe: false },
      message: { conversation: " Synthetic reply " },
    };
    sockets[0].ev.emit("messages.upsert", { type: "append", messages: [direct] });
    sockets[0].ev.emit("messages.upsert", {
      type: "notify",
      messages: [
        { ...direct, key: { ...direct.key, remoteJid: "group-test@g.us" } },
        { ...direct, key: { ...direct.key, remoteJid: "status@broadcast" } },
        { ...direct, key: { ...direct.key, fromMe: true } },
        direct,
      ],
    });
    await Promise.resolve();

    expect(mocks.postToApp).toHaveBeenCalledExactlyOnceWith({
      type: "message", businessId: "business-test", from: "15550000001",
      body: "Synthetic reply", providerMessageId: "message-test", contactName: undefined,
    });
  });
});
