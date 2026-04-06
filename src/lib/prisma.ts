import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not configured.");
}

const databaseUrl = new URL(connectionString);
const adapter = new PrismaPg({
  user: decodeURIComponent(databaseUrl.username),
  password: decodeURIComponent(databaseUrl.password),
  host: databaseUrl.hostname,
  port: Number(databaseUrl.port || 5432),
  database: databaseUrl.pathname.replace(/^\//, ""),
  ssl: {
    rejectUnauthorized: false,
  },
});

export const prisma =
  global.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
