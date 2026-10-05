import { beforeEach, describe, expect, it, vi } from "vitest";

const makeWASocket = vi.fn(() => ({ ev: { on: vi.fn() }, end: vi.fn() }));
const clearAuthState = vi.fn().mockResolvedValue(undefined);

vi.mock("baileys", () => ({
  default: makeWASocket,
  DisconnectReason: { loggedOut: 401 },
  fetchLatestBaileysVersion: vi.fn().mockResolvedValue({ version: [2, 3000, 1] }),
  isJidUser: vi.fn(),
  isLidUser: vi.fn(),
  jidDecode: vi.fn(),
  makeCacheableSignalKeyStore: vi.fn((keys) => keys),
  normalizeMessageContent: vi.fn(),
  proto: { WebMessageInfo: { Status: {} }, Message: { encode: vi.fn(), decode: vi.fn() } },
}));
vi.mock("./auth-state", () => ({
  usePostgresAuthState: vi.fn().mockResolvedValue({ state: { creds: {}, keys: {} }, saveCreds: vi.fn() }),
  clearAuthState,
}));
vi.mock("./bridge", () => ({ postToApp: vi.fn() }));
vi.mock("./prisma", () => ({ prisma: {} }));
vi.mock("./sent-message-store", () => ({ createPrismaSentMessageStore: vi.fn(() => ({})) }));

// Module state (the lease flag, held pairings, sends in flight) is per import:
// start fresh each test.
async function load() {
  vi.resetModules();
  return import("./socket-manager");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("pairing before this instance holds the lease (Codex #134)", () => {
  it("holds the request and starts the session once the lease is held", async () => {
    const manager = await load();

    await manager.pairSession("biz_new", false);
    expect(makeWASocket).not.toHaveBeenCalled();
    expect(manager.getStatus("biz_new").status).toBe("connecting");

    await manager.bootstrapSessions([]);
    expect(makeWASocket).toHaveBeenCalledTimes(1);
    expect(clearAuthState).not.toHaveBeenCalled();
  });

  it("runs a held forced re-link as one (fresh creds), even after a plain request", async () => {
    const manager = await load();

    await manager.pairSession("biz_1", true);
    await manager.pairSession("biz_1", false);
    await manager.bootstrapSessions(["biz_1"]);

    expect(clearAuthState).toHaveBeenCalledWith("biz_1");
    expect(makeWASocket).toHaveBeenCalledTimes(1);
  });

  it("starts nothing once shutdown has begun", async () => {
    const manager = await load();
    await manager.bootstrapSessions([]);
    manager.closeAllSessions();

    await manager.pairSession("biz_1", true);
    expect(clearAuthState).not.toHaveBeenCalled();
    expect(makeWASocket).not.toHaveBeenCalled();
  });

  it("pairs straight away while it holds the lease", async () => {
    const manager = await load();
    await manager.bootstrapSessions([]);

    await manager.pairSession("biz_1", false);
    expect(makeWASocket).toHaveBeenCalledTimes(1);
  });
});

describe("sendsSettled: shutdown waits for running sends (Codex #134)", () => {
  async function connected() {
    const manager = await load();
    const sendMessage = vi.fn();
    const handlers = new Map<string, (update: unknown) => void>();
    makeWASocket.mockImplementationOnce(() => ({
      ev: { on: vi.fn((event: string, handler: (update: unknown) => void) => handlers.set(event, handler)) },
      end: vi.fn(),
      sendMessage,
    }));
    await manager.bootstrapSessions(["biz_1"]);
    handlers.get("connection.update")!({ connection: "open" });
    return { manager, sendMessage };
  }

  it("is settled at once with nothing running", async () => {
    const { manager } = await connected();
    await expect(manager.sendsSettled(1_000)).resolves.toBe(true);
  });

  it("waits for a send still running when the sockets are closed", async () => {
    const { manager, sendMessage } = await connected();
    let finish!: (value: unknown) => void;
    sendMessage.mockReturnValue(new Promise((resolve) => (finish = resolve)));

    const send = manager.sendText("biz_1", "38344123456", "Hi").catch(() => undefined);
    manager.closeAllSessions();
    let settled: boolean | undefined;
    void manager.sendsSettled(60_000).then((value) => (settled = value));
    await Promise.resolve();
    expect(settled).toBeUndefined();

    finish({ key: { id: "BAE_1" } });
    await send;
    await vi.waitFor(() => expect(settled).toBe(true));
  });

  it("gives up after the timeout while a send is stuck", async () => {
    vi.useFakeTimers();
    try {
      const { manager, sendMessage } = await connected();
      sendMessage.mockReturnValue(new Promise(() => {}));
      void manager.sendText("biz_1", "38344123456", "Hi").catch(() => undefined);

      const settled = manager.sendsSettled(8_000);
      await vi.advanceTimersByTimeAsync(8_000);
      await expect(settled).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
