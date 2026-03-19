import { describe, expect, it, vi } from "vitest";

// Mock the database adapter modules so the test can import prisma.ts without
// a generated Prisma client or a real database connection.
// Using class syntax because both are instantiated with `new`.
vi.mock("@/generated/prisma/client", () => ({
  PrismaClient: class PrismaClient {},
}));

vi.mock("@prisma/adapter-pg", () => ({
  PrismaPg: class PrismaPg {},
}));

// Provide a fake DATABASE_URL so the module-level singleton does not throw
// when the module is first imported (it guards against an empty string).
vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:5432/testdb");

const { ensureConnectionPooler } = await import("./prisma");

const SUPABASE_DIRECT =
  "postgresql://user:pass@db.abcdef.supabase.co:5432/postgres";

describe("ensureConnectionPooler", () => {
  describe("early-return (no transformation)", () => {
    it("returns the URL unchanged when pgbouncer=true is already present", () => {
      const url =
        "postgresql://user:pass@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true";
      expect(ensureConnectionPooler(url)).toBe(url);
    });

    it("returns the URL unchanged when port 6543 is already in use", () => {
      const url =
        "postgresql://user:pass@db.abcdef.supabase.co:6543/postgres";
      expect(ensureConnectionPooler(url)).toBe(url);
    });

    it("returns a non-Supabase URL unchanged (no .supabase.co in host)", () => {
      const url = "postgresql://user:pass@localhost:5432/mydb";
      expect(ensureConnectionPooler(url)).toBe(url);
    });

    it("returns a non-Supabase URL unchanged even when it uses port 5432", () => {
      const url = "postgresql://user:pass@myhost.example.com:5432/mydb";
      expect(ensureConnectionPooler(url)).toBe(url);
    });
  });

  describe("transformation: Supabase direct-connection URL", () => {
    it("replaces port 5432 with 6543", () => {
      const result = ensureConnectionPooler(SUPABASE_DIRECT);
      expect(result).toContain(":6543/");
      expect(result).not.toContain(":5432/");
    });

    it("appends ?pgbouncer=true when the URL has no existing query params", () => {
      const result = ensureConnectionPooler(SUPABASE_DIRECT);
      expect(result).toContain("?pgbouncer=true");
    });

    it("produces the fully correct pooler URL from a plain direct URL", () => {
      expect(ensureConnectionPooler(SUPABASE_DIRECT)).toBe(
        "postgresql://user:pass@db.abcdef.supabase.co:6543/postgres?pgbouncer=true"
      );
    });

    it("appends &pgbouncer=true when the URL already has other query params", () => {
      const url = `${SUPABASE_DIRECT}?sslmode=require`;
      const result = ensureConnectionPooler(url);
      expect(result).toContain("&pgbouncer=true");
      expect(result).not.toContain("?pgbouncer=true");
    });

    it("preserves existing query params alongside the new pgbouncer param", () => {
      const url = `${SUPABASE_DIRECT}?sslmode=require`;
      const result = ensureConnectionPooler(url);
      expect(result).toBe(
        "postgresql://user:pass@db.abcdef.supabase.co:6543/postgres?sslmode=require&pgbouncer=true"
      );
    });

    it("does not double-add pgbouncer=true when it is already in query params", () => {
      const url = `${SUPABASE_DIRECT}?pgbouncer=true`;
      // This hits the early-return branch, so the URL is returned unchanged.
      expect(ensureConnectionPooler(url)).toBe(url);
    });
  });
});
