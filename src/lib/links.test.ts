import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    link: {
      findMany: vi.fn(),
    },
  },
}));

const { auth } = await import("@/lib/auth");
const prisma = (await import("@/lib/prisma")).default;
const { getLinksForCurrentUser } = await import("./links");

const MOCK_SESSION = { user: { id: "user-123" }, session: {} };

function makeRow(
  overrides: Partial<{
    id: string;
    title: string;
    description: string | null;
    thumbnail: string | null;
    contentType: "WEB" | "YOUTUBE";
    createdAt: Date;
  }> = {}
) {
  return {
    id: overrides.id ?? "link-1",
    url: "https://example.com",
    title: overrides.title ?? "Example",
    favicon: "https://www.google.com/s2/favicons?domain=example.com&sz=64",
    domain: "example.com",
    description: overrides.description ?? null,
    thumbnail: overrides.thumbnail ?? null,
    contentType: overrides.contentType ?? "WEB",
    createdAt: overrides.createdAt ?? new Date("2025-06-15T10:00:00Z"),
  };
}

describe("getLinksForCurrentUser", () => {
  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockReset();
    vi.mocked(prisma.link.findMany).mockReset();
  });

  it("returns an empty array when there are no saved links", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(prisma.link.findMany).mockResolvedValue([]);

    const result = await getLinksForCurrentUser();

    expect(result).toEqual([]);
  });

  it("queries only the authenticated user's links ordered newest-first", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(prisma.link.findMany).mockResolvedValue([]);

    await getLinksForCurrentUser();

    expect(vi.mocked(prisma.link.findMany)).toHaveBeenCalledWith({
      where: { userId: "user-123" },
      orderBy: { createdAt: "desc" },
    });
  });

  it("maps a database row to a Link preserving all fields", async () => {
    const row = makeRow();
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(prisma.link.findMany).mockResolvedValue([row] as never);

    const result = await getLinksForCurrentUser();

    expect(result).toHaveLength(1);
    const link = result[0];
    expect(link.id).toBe(row.id);
    expect(link.url).toBe(row.url);
    expect(link.title).toBe(row.title);
    expect(link.favicon).toBe(row.favicon);
    expect(link.description).toBe(row.description);
    expect(link.thumbnail).toBe(row.thumbnail);
    expect(link.domain).toBe(row.domain);
    expect(link.contentType).toBe(row.contentType);
    expect(link.createdAt).toBe(row.createdAt);
  });

  it("returns multiple links preserving the order returned by the database", async () => {
    const rows = [
      makeRow({ id: "link-2", createdAt: new Date("2025-06-15T12:00:00Z") }),
      makeRow({ id: "link-1", createdAt: new Date("2025-06-15T10:00:00Z") }),
    ];
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(prisma.link.findMany).mockResolvedValue(rows as never);

    const result = await getLinksForCurrentUser();

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("link-2");
    expect(result[1].id).toBe("link-1");
  });

  it("passes undefined as userId to the query when there is no active session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    vi.mocked(prisma.link.findMany).mockResolvedValue([]);

    await getLinksForCurrentUser();

    // When session is null, session?.user.id resolves to undefined.
    // Prisma treats { where: { userId: undefined } } as no filter, returning
    // all rows. This test documents that behaviour so any change is intentional.
    expect(vi.mocked(prisma.link.findMany)).toHaveBeenCalledWith({
      where: { userId: undefined },
      orderBy: { createdAt: "desc" },
    });
  });
});
