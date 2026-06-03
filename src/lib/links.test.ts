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
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/entitlements", () => ({
  assertCanSaveLink: vi.fn(),
  shouldRunIngest: vi.fn().mockResolvedValue({ run: false }),
  BillingLimitError: class BillingLimitError extends Error {
    feature = "SAVE_LIMIT";
  },
}));
vi.mock("@/lib/realtime-broadcast", () => ({
  broadcastLinksChanged: vi.fn(),
}));
vi.mock("@/lib/notify-links-after-ingest", () => ({
  notifyLinksAfterIngest: vi.fn(),
}));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: vi.fn() };
});

const { auth } = await import("@/lib/auth");
const prisma = (await import("@/lib/prisma")).default;
const { getLinksForCurrentUser, UnauthorizedError, listLinks } = await import("./links");

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

  it("throws and does not query links when there is no active session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    vi.mocked(prisma.link.findMany).mockResolvedValue([]);

    await expect(getLinksForCurrentUser()).rejects.toBeInstanceOf(
      UnauthorizedError,
    );

    expect(vi.mocked(prisma.link.findMany)).not.toHaveBeenCalled();
  });
});

const MOCK_LINK = {
  id: "link-1",
  url: "https://example.com",
  title: "Example",
  description: null,
  favicon: "https://example.com/favicon.ico",
  thumbnail: null,
  domain: "example.com",
  contentType: "WEB" as const,
  ingestStatus: "COMPLETED" as const,
  createdAt: new Date("2025-01-01T12:00:00.000Z"),
  userId: "user-1",
  storagePath: null,
  ingestFailureReason: null,
};

describe("listLinks", () => {
  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockReset();
    vi.mocked(prisma.link.findMany).mockReset();
  });

  it("throws UnauthorizedError when not authenticated", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);
    await expect(
      listLinks({ limit: 50, cursor: null, contentType: null })
    ).rejects.toThrow("Unauthorized");
  });

  it("returns links with null nextCursor when results fit in one page", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(prisma.link.findMany).mockResolvedValue([MOCK_LINK] as never);
    const result = await listLinks({ limit: 50, cursor: null, contentType: null });
    expect(result.links).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it("returns nextCursor when more results exist", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    const links = Array.from({ length: 51 }, (_, i) => ({
      ...MOCK_LINK,
      id: `link-${i}`,
      createdAt: new Date(Date.now() - i * 1000),
    }));
    vi.mocked(prisma.link.findMany).mockResolvedValue(links as never);
    const result = await listLinks({ limit: 50, cursor: null, contentType: null });
    expect(result.links).toHaveLength(50);
    expect(result.nextCursor).toBe(result.links[49].createdAt.toISOString());
  });

  it("passes contentType filter to query", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(prisma.link.findMany).mockResolvedValue([] as never);
    await listLinks({ limit: 50, cursor: null, contentType: "YOUTUBE" });
    expect(vi.mocked(prisma.link.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-123", contentType: "YOUTUBE" },
      })
    );
  });

  it("uses cursor as lt filter on createdAt", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(prisma.link.findMany).mockResolvedValue([] as never);
    const cursor = "2025-01-01T12:00:00.000Z";
    await listLinks({ limit: 50, cursor, contentType: null });
    expect(vi.mocked(prisma.link.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-123", createdAt: { lt: new Date(cursor) } },
      })
    );
  });

  it("ignores an invalid cursor string", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    vi.mocked(prisma.link.findMany).mockResolvedValue([] as never);
    await listLinks({ limit: 50, cursor: "not-a-date", contentType: null });
    expect(vi.mocked(prisma.link.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-123" },
      })
    );
  });
});
