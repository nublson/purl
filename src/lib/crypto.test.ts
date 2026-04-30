import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decrypt, encrypt } from "./crypto";

const VALID_KEY_HEX = "0".repeat(64); // 32 bytes of zeros as hex

describe("crypto – encrypt / decrypt", () => {
  const prevKey = process.env.ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = VALID_KEY_HEX;
  });

  afterEach(() => {
    if (prevKey === undefined) {
      delete process.env.ENCRYPTION_KEY;
    } else {
      process.env.ENCRYPTION_KEY = prevKey;
    }
  });

  it("encrypt returns a colon-delimited string with three hex parts", () => {
    const result = encrypt("hello");
    const parts = result.split(":");
    expect(parts).toHaveLength(3);
    // All parts must be valid hex strings
    for (const part of parts) {
      expect(part).toMatch(/^[0-9a-f]+$/);
    }
  });

  it("decrypt round-trips a plaintext string", () => {
    const plaintext = "sk-my-secret-api-key";
    const ciphertext = encrypt(plaintext);
    expect(decrypt(ciphertext)).toBe(plaintext);
  });

  it("produces different ciphertexts for the same plaintext (random IV)", () => {
    const ct1 = encrypt("same input");
    const ct2 = encrypt("same input");
    expect(ct1).not.toBe(ct2);
  });

  it("decrypt throws on a truncated ciphertext missing parts", () => {
    expect(() => decrypt("aabbcc:ddeeff")).toThrow("Invalid ciphertext format");
  });

  it("decrypt throws on a ciphertext with extra parts", () => {
    expect(() => decrypt("aa:bb:cc:dd")).toThrow("Invalid ciphertext format");
  });

  it("decrypt throws when the auth tag has been tampered with", () => {
    const ct = encrypt("original text");
    const parts = ct.split(":");
    // Flip one nibble of the tag
    parts[1] = parts[1]!.replace(/.$/, (c) => (c === "f" ? "0" : "f"));
    expect(() => decrypt(parts.join(":"))).toThrow();
  });

  it("throws when ENCRYPTION_KEY is not set", () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => encrypt("x")).toThrow("ENCRYPTION_KEY is not set");
  });

  it("throws when ENCRYPTION_KEY is the wrong length (< 64 hex chars)", () => {
    process.env.ENCRYPTION_KEY = "aabbcc";
    expect(() => encrypt("x")).toThrow(
      "ENCRYPTION_KEY must be 32 bytes (64 hex chars)",
    );
  });

  it("throws when ENCRYPTION_KEY is the wrong length (> 64 hex chars)", () => {
    process.env.ENCRYPTION_KEY = "0".repeat(66);
    expect(() => encrypt("x")).toThrow(
      "ENCRYPTION_KEY must be 32 bytes (64 hex chars)",
    );
  });

  it("round-trips unicode and multi-byte characters", () => {
    const text = "こんにちは 🌍 Héllo";
    expect(decrypt(encrypt(text))).toBe(text);
  });

  it("round-trips an empty string", () => {
    expect(decrypt(encrypt(""))).toBe("");
  });
});
