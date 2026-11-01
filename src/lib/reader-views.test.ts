import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => {
  const client = {
    $queryRaw: vi.fn(),
    readerView: { deleteMany: vi.fn(), findUnique: vi.fn() },
    link: { findFirst: vi.fn() },
  };
  return { default: client, prisma: client };
});

const prisma = (await import("@/lib/prisma")).default;
const {
  buildReaderTsQuery,
  readReaderViewForUser,
  readerLinkIdsMatching,
  resetFailedReaderView,
} = await import("./reader-views");

const queryRaw = vi.mocked(prisma.$queryRaw);

describe("buildReaderTsQuery", () => {
  it("makes a prefix lexeme", () => {
    expect(buildReaderTsQuery("Swal")).toBe("'swal':*");
  });
  it("joins words with &", () => {
    expect(buildReaderTsQuery("swallow  migration")).toBe(
      "'swallow':* & 'migration':*",
    );
  });
  it("doubles quotes", () => {
    expect(buildReaderTsQuery("it's")).toBe("'it''s':*");
  });
  it("quotes operators", () => {
    expect(buildReaderTsQuery("a & b:c \\x")).toBe(
      "'a':* & '&':* & 'bc':* & 'x':*",
    );
  });
  it("builds no query from punctuation only", () => {
    expect(buildReaderTsQuery("\\ :")).toBeNull();
    expect(buildReaderTsQuery("   ")).toBeNull();
  });
});

describe("readerLinkIdsMatching", () => {
  beforeEach(() => queryRaw.mockReset());
  it("does not query without a tsquery", async () => {
    expect(await readerLinkIdsMatching("u1", " : ")).toEqual([]);
    expect(queryRaw).not.toHaveBeenCalled();
  });
  it("queries ready views and maps ids", async () => {
    queryRaw.mockResolvedValueOnce([{ linkId: "a" }, { linkId: "b" }] as never);
    expect(await readerLinkIdsMatching("u1", "bird")).toEqual(["a", "b"]);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    const sql = (queryRaw.mock.calls[0][0] as unknown as string[]).join("?");
    expect(sql).toContain("status = 'READY'");
    expect(sql).toContain("to_tsquery('simple'");
    expect(sql).toContain("LIMIT 1000");
    expect(queryRaw.mock.calls[0].slice(1)).toEqual(["u1", "'bird':*"]);
  });
});

describe("resetFailedReaderView", () => {
  const findFirst = vi.mocked(prisma.link.findFirst);
  const deleteMany = vi.mocked(prisma.readerView.deleteMany);
  beforeEach(() => {
    findFirst.mockReset();
    deleteMany.mockReset();
  });

  it("is not_found when the link isn't the user's", async () => {
    findFirst.mockResolvedValue(null as never);
    expect(await resetFailedReaderView("u1", "l1")).toBe("not_found");
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "l1", userId: "u1" },
      select: { id: true },
    });
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("is not_failed when no failed row was deleted", async () => {
    findFirst.mockResolvedValue({ id: "l1" } as never);
    deleteMany.mockResolvedValue({ count: 0 } as never);
    expect(await resetFailedReaderView("u1", "l1")).toBe("not_failed");
  });

  it("deletes the failed row and answers reset", async () => {
    findFirst.mockResolvedValue({ id: "l1" } as never);
    deleteMany.mockResolvedValue({ count: 1 } as never);
    expect(await resetFailedReaderView("u1", "l1")).toBe("reset");
    expect(deleteMany).toHaveBeenCalledWith({
      where: { linkId: "l1", userId: "u1", status: "FAILED" },
    });
  });
});

describe("readReaderViewForUser", () => {
  const findFirst = vi.mocked(prisma.link.findFirst);
  const findUnique = vi.mocked(prisma.readerView.findUnique);
  beforeEach(() => {
    findFirst.mockReset();
    findUnique.mockReset();
  });

  it("is null when the link isn't the user's", async () => {
    findFirst.mockResolvedValue(null as never);
    expect(await readReaderViewForUser("u1", "l1")).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("returns the link and its view (null without a row)", async () => {
    const link = { title: "T", url: "https://a.example", contentType: "WEB", fileKey: null };
    findFirst.mockResolvedValue(link as never);
    findUnique.mockResolvedValue(null as never);
    expect(await readReaderViewForUser("u1", "l1")).toEqual({ link, view: null });
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "l1", userId: "u1" },
      select: {
        title: true,
        url: true,
        contentType: true,
        fileKey: true,
        favicon: true,
        domain: true,
      },
    });
    const view = { status: "READY", reason: null, markdown: "m", fetchedAt: new Date() };
    findUnique.mockResolvedValue(view as never);
    expect(await readReaderViewForUser("u1", "l1")).toEqual({ link, view });
  });
});
