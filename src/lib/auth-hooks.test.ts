import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: vi.fn() },
  },
}));

const prisma = (await import("@/lib/prisma")).default;
const { assignUsernameOnCreate } = await import("./auth-hooks");

describe("assignUsernameOnCreate", () => {
  beforeEach(() => {
    vi.mocked(prisma.user.findUnique).mockReset();
  });

  it("assigns a generated username", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    const result = await assignUsernameOnCreate({ email: "nubelson@x.com", name: "N" });
    expect(result.data.username).toBe("nubelson");
    expect(result.data.email).toBe("nubelson@x.com");
  });

  it("skips taken usernames", async () => {
    vi.mocked(prisma.user.findUnique).mockImplementation((async ({ where }: { where: { username: string } }) =>
      where.username === "nubelson" ? { id: "u1" } : null) as never);
    const result = await assignUsernameOnCreate({ email: "nubelson@x.com", name: "N" });
    expect(result.data.username).toBe("nubelson2");
  });
});
