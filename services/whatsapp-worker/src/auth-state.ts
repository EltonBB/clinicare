import { BufferJSON, initAuthCreds, proto } from "baileys";
import type {
  AuthenticationCreds,
  AuthenticationState,
  SignalDataTypeMap,
} from "baileys";
import type { Prisma } from "@prisma/client";

import { prisma } from "./prisma";

// Baileys auth values contain Buffers/Uint8Arrays that don't round-trip through
// plain JSON. BufferJSON encodes them; we run it through JSON.parse so the result
// is a clean structure a Prisma `Json` column can store, and reverse on read.
function serialize(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value, BufferJSON.replacer)
  ) as Prisma.InputJsonValue;
}

function deserialize<T>(value: Prisma.JsonValue): T {
  return JSON.parse(JSON.stringify(value), BufferJSON.reviver) as T;
}

/**
 * Postgres-backed Baileys auth state for one workspace.
 *
 * `creds` is the main credential blob (one WhatsAppSession row); Signal-protocol
 * keys are individual WhatsAppSessionKey rows so each updates independently
 * instead of rewriting one giant blob on every socket event (the demo
 * useMultiFileAuthState is explicitly not for production).
 */
export async function usePostgresAuthState(businessId: string): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}> {
  const existing = await prisma.whatsAppSession.findUnique({
    where: { businessId },
  });
  const creds: AuthenticationCreds = existing
    ? deserialize<AuthenticationCreds>(existing.creds)
    : initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(
          type: T,
          ids: string[]
        ) => {
          const rows = await prisma.whatsAppSessionKey.findMany({
            where: { businessId, category: type, keyId: { in: ids } },
          });
          const data: { [id: string]: SignalDataTypeMap[T] } = {};
          for (const row of rows) {
            let value = deserialize<SignalDataTypeMap[T]>(row.value);
            if (type === "app-state-sync-key" && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(
                value as object
              ) as unknown as SignalDataTypeMap[T];
            }
            data[row.keyId] = value;
          }
          return data;
        },
        set: async (data) => {
          const tasks: Prisma.PrismaPromise<unknown>[] = [];
          for (const category of Object.keys(data)) {
            const entries = data[category as keyof typeof data] ?? {};
            for (const keyId of Object.keys(entries)) {
              const value = entries[keyId];
              if (value) {
                const serialized = serialize(value);
                tasks.push(
                  prisma.whatsAppSessionKey.upsert({
                    where: {
                      businessId_category_keyId: { businessId, category, keyId },
                    },
                    create: { businessId, category, keyId, value: serialized },
                    update: { value: serialized },
                  })
                );
              } else {
                tasks.push(
                  prisma.whatsAppSessionKey.deleteMany({
                    where: { businessId, category, keyId },
                  })
                );
              }
            }
          }
          // One transaction so a partial failure can't leave the Signal key
          // store half-written (which would desync creds/keys and force a
          // re-pair). clearAuthState already uses the same all-or-nothing shape.
          if (tasks.length > 0) {
            await prisma.$transaction(tasks);
          }
        },
      },
    },
    saveCreds: async () => {
      const serialized = serialize(creds);
      await prisma.whatsAppSession.upsert({
        where: { businessId },
        create: { businessId, creds: serialized },
        update: { creds: serialized },
      });
    },
  };
}

/** Wipe a workspace's session (used after logout) so a fresh pair is required. */
export async function clearAuthState(businessId: string): Promise<void> {
  await prisma.$transaction([
    prisma.whatsAppSessionKey.deleteMany({ where: { businessId } }),
    prisma.whatsAppSession.deleteMany({ where: { businessId } }),
  ]);
}
