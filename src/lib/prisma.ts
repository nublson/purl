import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Converts a Supabase direct connection URL to use the connection pooler.
 * Supabase connection pooler uses port 6543 and requires pgbouncer=true parameter.
 * This prevents "MaxClientsInSessionMode" errors in serverless environments.
 *
 * @param databaseUrl - The original DATABASE_URL (can be direct or pooler URL)
 * @returns The connection pooler URL if it's a Supabase direct connection, otherwise returns as-is
 */
export function ensureConnectionPooler(databaseUrl: string): string {
  // If already using pooler or not a Supabase URL, return as-is
  if (
    databaseUrl.includes("pgbouncer=true") ||
    databaseUrl.includes(":6543/") ||
    !databaseUrl.includes(".supabase.co")
  ) {
    return databaseUrl;
  }

  // Convert direct connection (port 5432) to pooler connection (port 6543)
  let poolerUrl = databaseUrl.replace(/:5432\//, ":6543/");

  // Add pgbouncer=true parameter
  if (poolerUrl.includes("?")) {
    // Already has query params, append pgbouncer=true
    if (!poolerUrl.includes("pgbouncer=true")) {
      poolerUrl = `${poolerUrl}&pgbouncer=true`;
    }
  } else {
    // No query params, add pgbouncer=true
    poolerUrl = `${poolerUrl}?pgbouncer=true`;
  }

  return poolerUrl;
}

/**
 * Creates and exports a PrismaClient instance.
 * The DATABASE_URL must be provided via environment variable.
 * Automatically uses Supabase connection pooler in production to prevent connection exhaustion.
 *
 * @example
 * ```ts
 * import { prisma } from '@/lib/prisma';
 * const user = await prisma.user.findUnique({ where: { id: '...' } });
 * ```
 */
export function createPrismaClient(
  databaseUrl: string,
  options?: { log?: ("query" | "info" | "warn" | "error")[] }
) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  // Use connection pooler in production to prevent connection exhaustion
  const connectionUrl =
    process.env.NODE_ENV === "production"
      ? ensureConnectionPooler(databaseUrl)
      : databaseUrl;

  const adapter = new PrismaPg({ connectionString: connectionUrl });
  return new PrismaClient({
    log:
      options?.log ?? (process.env.NODE_ENV === "development" ? ["query"] : []),
    adapter,
  });
}

// PrismaClient is attached to the `global` object to prevent
// exhausting your database connection limit in serverless environments.
// Learn more: https://pris.ly/d/help/next-js-best-practices
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Default PrismaClient instance.
 * Requires DATABASE_URL environment variable to be set.
 * Uses singleton pattern to prevent multiple instances in serverless environments.
 */
export const prisma =
  globalForPrisma.prisma ??
  createPrismaClient(process.env.DATABASE_URL || "", {
    log: process.env.NODE_ENV === "development" ? ["query"] : [],
  });

// Always set global singleton to prevent multiple instances
// This is critical in serverless environments like Vercel
if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = prisma;
}

// Re-export Prisma types and utilities
export * from "@/generated/prisma/client";

export default prisma;
