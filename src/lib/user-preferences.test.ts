import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const prisma = (await import("@/lib/prisma")).default;
const { getPreferences, updatePreferences } = await import("./user-preferences");

describe("getPreferences", () => {
  beforeEach(() => {
    vi.mocked(prisma.user.findUnique).mockReset();
  });

  it("returns parsed preferences from the user row", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      preferences: { defaultPage: "ai", showChatWidget: false },
    } as never);

    const result = await getPreferences("user-1");

    expect(result).toEqual({ defaultPage: "ai", showChatWidget: false });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: { preferences: true },
    });
  });

  it("returns defaults when the user is not found", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const result = await getPreferences("missing");

    expect(result).toEqual({ defaultPage: "home", showChatWidget: true });
  });

  it("returns defaults when stored preferences are null", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      preferences: null,
    } as never);

    const result = await getPreferences("user-1");

    expect(result).toEqual({ defaultPage: "home", showChatWidget: true });
  });
});

describe("updatePreferences", () => {
  beforeEach(() => {
    vi.mocked(prisma.user.findUnique).mockReset();
    vi.mocked(prisma.user.update).mockReset();
  });

  it("merges the patch into current preferences and persists to the database", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      preferences: { defaultPage: "home", showChatWidget: true },
    } as never);
    vi.mocked(prisma.user.update).mockResolvedValue({} as never);

    const result = await updatePreferences("user-1", { defaultPage: "ai" });

    expect(result).toEqual({ defaultPage: "ai", showChatWidget: true });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        preferences: { defaultPage: "ai", showChatWidget: true },
      },
    });
  });

  it("merges showChatWidget without resetting defaultPage", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      preferences: { defaultPage: "ai", showChatWidget: true },
    } as never);
    vi.mocked(prisma.user.update).mockResolvedValue({} as never);

    const result = await updatePreferences("user-1", { showChatWidget: false });

    expect(result).toEqual({ defaultPage: "ai", showChatWidget: false });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        preferences: { defaultPage: "ai", showChatWidget: false },
      },
    });
  });
});
