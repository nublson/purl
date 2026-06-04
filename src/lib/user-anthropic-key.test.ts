import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const VALID_KEY_HEX = "0".repeat(64);

const prisma = (await import("@/lib/prisma")).default;
const {
  deleteByokKey,
  getByokKey,
  getDecryptedByokKey,
  maskByokKey,
  saveByokKey,
} = await import("./user-anthropic-key");

const VALID_ANTHROPIC_KEY = "sk-ant-api03-abcdefghijklmnopqrst";

describe("maskByokKey", () => {
  it("masks a standard key showing prefix and last four characters", () => {
    expect(maskByokKey(VALID_ANTHROPIC_KEY)).toBe(
      "sk-ant-api...qrst",
    );
  });

  it("returns a fixed placeholder for short keys", () => {
    expect(maskByokKey("sk-ant-short")).toBe("sk-ant-***");
  });
});

describe("getByokKey", () => {
  beforeEach(() => {
    vi.mocked(prisma.user.findUnique).mockReset();
  });

  it("returns hasKey false when no encrypted key is stored", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      anthropicApiKeyEncrypted: null,
    } as never);

    await expect(getByokKey("user-1")).resolves.toEqual({
      hasKey: false,
      encryptedKey: null,
    });
  });

  it("returns hasKey true when an encrypted key exists", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      anthropicApiKeyEncrypted: "iv:tag:cipher",
    } as never);

    await expect(getByokKey("user-1")).resolves.toEqual({
      hasKey: true,
      encryptedKey: "iv:tag:cipher",
    });
  });
});

describe("getDecryptedByokKey", () => {
  const prevKey = process.env.ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = VALID_KEY_HEX;
    vi.mocked(prisma.user.findUnique).mockReset();
  });

  afterEach(() => {
    if (prevKey === undefined) {
      delete process.env.ENCRYPTION_KEY;
    } else {
      process.env.ENCRYPTION_KEY = prevKey;
    }
  });

  it("returns null when the user has no stored key", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      anthropicApiKeyEncrypted: null,
    } as never);

    await expect(getDecryptedByokKey("user-1")).resolves.toBeNull();
  });

  it("decrypts the stored key", async () => {
    const { encrypt } = await import("./crypto");
    const encrypted = encrypt(VALID_ANTHROPIC_KEY);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      anthropicApiKeyEncrypted: encrypted,
    } as never);

    await expect(getDecryptedByokKey("user-1")).resolves.toBe(
      VALID_ANTHROPIC_KEY,
    );
  });
});

describe("saveByokKey", () => {
  const prevKey = process.env.ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = VALID_KEY_HEX;
    vi.mocked(prisma.user.update).mockReset();
    vi.mocked(prisma.user.update).mockResolvedValue({} as never);
  });

  afterEach(() => {
    if (prevKey === undefined) {
      delete process.env.ENCRYPTION_KEY;
    } else {
      process.env.ENCRYPTION_KEY = prevKey;
    }
  });

  it("rejects keys that do not start with sk-ant-", async () => {
    await expect(saveByokKey("user-1", "sk-openai-123456789012345")).rejects.toThrow(
      "Key must start with sk-ant- and be at least 20 characters",
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("rejects keys shorter than 20 characters", async () => {
    await expect(saveByokKey("user-1", "sk-ant-short")).rejects.toThrow(
      "Key must start with sk-ant- and be at least 20 characters",
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("encrypts and persists a valid key", async () => {
    await saveByokKey("user-1", VALID_ANTHROPIC_KEY);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        anthropicApiKeyEncrypted: expect.stringMatching(
          /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/,
        ),
      },
    });
  });
});

describe("deleteByokKey", () => {
  beforeEach(() => {
    vi.mocked(prisma.user.update).mockReset();
    vi.mocked(prisma.user.update).mockResolvedValue({} as never);
  });

  it("clears the encrypted key for the user", async () => {
    await deleteByokKey("user-1");

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { anthropicApiKeyEncrypted: null },
    });
  });
});
