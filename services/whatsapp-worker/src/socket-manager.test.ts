import { beforeEach, describe, expect, it, vi } from "vitest";

const makeWASocket = vi.fn(() => ({ ev: { on: vi.fn() }, end: vi.fn() }));
const clearAuthState = vi.fn().mockResolvedValue(undefined);
const usePostgresAuthState = vi.fn();

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
  usePostgresAuthState,
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
  usePostgresAuthState.mockResolvedValue({ state: { creds: {}, keys: {} }, saveCreds: vi.fn() });
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

  // Codex #134: Settings stops polling on "disconnected", so a held pairing must
  // read "connecting" until its own start begins.
  it("keeps every held pairing and saved session 'connecting' until its own start", async () => {
    const manager = await load();
    await manager.pairSession("biz_a", false);
    await manager.pairSession("biz_b", false);
    usePostgresAuthState.mockReturnValueOnce(new Promise(() => {})); // biz_a's start hangs

    void manager.bootstrapSessions(["biz_saved"]);
    await Promise.resolve();

    expect(manager.getStatus("biz_a").status).toBe("connecting");
    expect(manager.getStatus("biz_b").status).toBe("connecting");
    expect(manager.getStatus("biz_saved").status).toBe("connecting");
    expect(manager.getStatus("biz_unknown").status).toBe("disconnected");
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

describe("accountWorkSettled: shutdown waits for running account work (Codex #134)", () => {
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
    await expect(manager.accountWorkSettled(1_000)).resolves.toBe(true);
  });

  it("waits for a send still running when the sockets are closed", async () => {
    const { manager, sendMessage } = await connected();
    let finish!: (value: unknown) => void;
    sendMessage.mockReturnValue(new Promise((resolve) => (finish = resolve)));

    const send = manager.sendText("biz_1", "38344123456", "Hi").catch(() => undefined);
    manager.closeAllSessions();
    let settled: boolean | undefined;
    void manager.accountWorkSettled(60_000).then((value) => (settled = value));
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

      const settled = manager.accountWorkSettled(8_000);
      await vi.advanceTimersByTimeAsync(8_000);
      await expect(settled).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("accountWorkSettled covers pairings too (Codex #134)", () => {
  it("waits for a forced re-link still wiping the stored creds", async () => {
    const manager = await load();
    await manager.bootstrapSessions([]);
    let finishWipe!: () => void;
    clearAuthState.mockReturnValueOnce(new Promise<void>((resolve) => (finishWipe = resolve)));

    const pairing = manager.pairSession("biz_1", true);
    manager.closeAllSessions();
    let settled: boolean | undefined;
    void manager.accountWorkSettled(60_000).then((value) => (settled = value));
    await Promise.resolve();
    expect(settled).toBeUndefined();

    finishWipe();
    await pairing;
    await vi.waitFor(() => expect(settled).toBe(true));
    expect(makeWASocket).not.toHaveBeenCalled(); // shutdown began: no socket after the wipe
  });
});
