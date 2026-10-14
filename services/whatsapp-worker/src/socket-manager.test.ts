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
const remember = vi.fn().mockResolvedValue(undefined);
vi.mock("./sent-message-store", () => ({ createPrismaSentMessageStore: vi.fn(() => ({ remember })) }));

// Module state (the lease flag, held pairings) is per import: start fresh each test.
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

describe("sendText keeps resend copies", () => {
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
  const SENT = { key: { id: "BAE_1" }, message: { conversation: "Hi" } };

  it("keeps the copy before answering", async () => {
    const { manager, sendMessage } = await connected();
    sendMessage.mockResolvedValue(SENT);

    await expect(manager.sendText("biz_1", "38344123456", "Hi")).resolves.toEqual({
      providerMessageId: "BAE_1",
      status: "SENT",
    });
    expect(remember).toHaveBeenCalledWith("biz_1", "BAE_1", SENT.message);
  });

  // Codex #134: a timed-out send is possibly delivered, so it needs a copy too.
  it("keeps the copy of a send that goes out after it timed out", async () => {
    vi.useFakeTimers();
    try {
      const { manager, sendMessage } = await connected();
      sendMessage.mockReturnValue(new Promise((resolve) => setTimeout(() => resolve(SENT), 25_000)));

      const result = manager.sendText("biz_1", "38344123456", "Hi");
      const failed = expect(result).rejects.toThrow("timed out");
      await vi.advanceTimersByTimeAsync(20_000);
      await failed;
      expect(remember).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(5_000);
      expect(remember).toHaveBeenCalledWith("biz_1", "BAE_1", SENT.message);
    } finally {
      vi.useRealTimers();
    }
  });
});
