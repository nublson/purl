import { describe, expect, it } from "vitest";
import { generateUsername, usernameBaseFrom, validateUsername } from "./usernames";

describe("validateUsername", () => {
  it("normalizes then accepts", () => expect(validateUsername("  NubLson ")).toEqual({ ok: true, username: "nublson" }));
  it.each(["ab", "a".repeat(31), "-abc", "_abc", "ab c", "abç"])("rejects %s as format", (u) =>
    expect(validateUsername(u)).toEqual({ ok: false, reason: "format" }));
  it("rejects reserved", () => expect(validateUsername("Admin")).toEqual({ ok: false, reason: "reserved" }));
  it("accepts 30 chars with - and _", () => expect(validateUsername("a_b-" + "c".repeat(26)).ok).toBe(true));
});

describe("usernameBaseFrom", () => {
  it("uses the email local part without +tag", () => expect(usernameBaseFrom("Nubel.Son+news@x.com", "N")).toBe("nubelson"));
  it("strips accents", () => expect(usernameBaseFrom("josé@x.com", null)).toBe("jose"));
  it("trims leading -/_ and collapses repeats", () => expect(usernameBaseFrom("__a--b__c@x.com", null)).toBe("a-b_c"));
  it("truncates to 26", () => expect(usernameBaseFrom("a".repeat(40) + "@x.com", null)).toHaveLength(26));
  it("falls back to name", () => expect(usernameBaseFrom("日本@x.com", "Ana Lima")).toBe("ana-lima"));
  it("falls back to user", () => expect(usernameBaseFrom("..@x.com", "李")).toBe("user"));
  it("suffixes reserved", () => expect(usernameBaseFrom("admin@x.com", null)).toBe("admin-1"));
});

describe("generateUsername", () => {
  it("returns the base when free", async () =>
    expect(await generateUsername("nubelson@x.com", null, async () => false)).toBe("nubelson"));
  it("counts up on collision", async () => {
    const taken = new Set(["nubelson", "nubelson2"]);
    expect(await generateUsername("nubelson@x.com", null, async (u) => taken.has(u))).toBe("nubelson3");
  });
  it("falls back to a random suffix after 50 tries", async () => {
    const u = await generateUsername("nubelson@x.com", null, async (c) => !/^nubelson-[a-z0-9]{4}$/.test(c));
    expect(u).toMatch(/^nubelson-[a-z0-9]{4}$/);
  });
  it("keeps the random fallback within 30 chars for a 26-char base", async () => {
    const base = "abcdefghijklmnopqrstuvwxyz";
    const numbered = new Set([base, ...Array.from({ length: 49 }, (_, i) => `${base}${i + 2}`)]);
    const u = await generateUsername(`${base}@x.com`, null, async (c) => numbered.has(c));
    expect(u).toMatch(/^abcdefghijklmnopqrstuvwxy-[a-z0-9]{4}$/);
    expect(u.length).toBeLessThanOrEqual(30);
    expect(validateUsername(u).ok).toBe(true);
  });
  it("always returns a valid username", async () =>
    expect(validateUsername(await generateUsername("日本@x.com", "", async () => false)).ok).toBe(true));
});
