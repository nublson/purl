import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUserFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  default: { user: { findUnique: mockUserFindUnique } },
}));

const mockRevalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));

const { revalidateLandingDemoFor } = await import("./demo-revalidation");

describe("revalidateLandingDemoFor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("revalidates the landing page for the demo account", async () => {
    mockUserFindUnique.mockResolvedValue({ username: "purl" });

    await revalidateLandingDemoFor("u1");

    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { id: "u1" },
      select: { username: true },
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/");
  });

  it("does nothing for other users", async () => {
    mockUserFindUnique.mockResolvedValue({ username: "someone" });

    await revalidateLandingDemoFor("u2");

    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("does nothing for a missing user", async () => {
    mockUserFindUnique.mockResolvedValue(null);

    await revalidateLandingDemoFor("u3");

    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("swallows errors", async () => {
    mockUserFindUnique.mockRejectedValue(new Error("db down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(revalidateLandingDemoFor("u1")).resolves.toBeUndefined();

    expect(mockRevalidatePath).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
