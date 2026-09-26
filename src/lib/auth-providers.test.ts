import { describe, expect, it } from "vitest";
import {
  ACCOUNT_LINKING,
  APPLE_TRUSTED_ORIGIN,
  AUTH_LOGIN_PAGE,
  getEnabledProviders,
  getSocialProviders,
} from "./auth-providers";

const base = {
  GOOGLE_CLIENT_ID: "g",
  GOOGLE_CLIENT_SECRET: "gs",
  GITHUB_CLIENT_ID: "h",
  GITHUB_CLIENT_SECRET: "hs",
};

describe("getEnabledProviders", () => {
  it("enables google and github", () => {
    expect(getEnabledProviders(base)).toEqual(["google", "github"]);
  });

  it("enables apple only with all four vars", () => {
    expect(
      getEnabledProviders({
        ...base,
        APPLE_CLIENT_ID: "a",
        APPLE_TEAM_ID: "t",
        APPLE_KEY_ID: "k",
      }),
    ).not.toContain("apple");
    expect(
      getEnabledProviders({
        ...base,
        APPLE_CLIENT_ID: "a",
        APPLE_TEAM_ID: "t",
        APPLE_KEY_ID: "k",
        APPLE_PRIVATE_KEY: "p",
      }),
    ).toContain("apple");
  });

  it("skips google or github outside production when their vars are missing", () => {
    expect(getEnabledProviders({ GITHUB_CLIENT_ID: "h", GITHUB_CLIENT_SECRET: "hs" })).toEqual(["github"]);
  });
});

describe("getSocialProviders", () => {
  it("throws in production when github is missing", () => {
    expect(() =>
      getSocialProviders({ ...base, GITHUB_CLIENT_ID: undefined, NODE_ENV: "production" }),
    ).toThrow(/GITHUB_CLIENT_ID/);
  });

  it("does not throw outside production when github is missing, and skips it", () => {
    const providers = getSocialProviders({ ...base, GITHUB_CLIENT_ID: undefined, GITHUB_CLIENT_SECRET: undefined });
    expect(providers?.github).toBeUndefined();
    expect(providers?.google).toMatchObject({ clientId: "g", clientSecret: "gs" });
  });

  it("does not configure apple when its vars are absent", () => {
    const providers = getSocialProviders(base);
    expect(providers?.apple).toBeUndefined();
  });

  it("does not throw during the next build phase even in production, and omits the missing provider", () => {
    let providers: ReturnType<typeof getSocialProviders> | undefined;
    expect(() => {
      providers = getSocialProviders({
        ...base,
        GITHUB_CLIENT_ID: undefined,
        GITHUB_CLIENT_SECRET: undefined,
        NODE_ENV: "production",
        NEXT_PHASE: "phase-production-build",
      });
    }).not.toThrow();
    expect(providers?.github).toBeUndefined();
    expect(providers?.google).toMatchObject({ clientId: "g", clientSecret: "gs" });
  });

  it("still throws in production once the build phase has passed (e.g. at runtime)", () => {
    expect(() =>
      getSocialProviders({
        ...base,
        GITHUB_CLIENT_ID: undefined,
        NODE_ENV: "production",
        NEXT_PHASE: undefined,
      }),
    ).toThrow(/GITHUB_CLIENT_ID/);
  });
});

describe("constants", () => {
  it("links legacy unverified accounts", () => {
    expect(ACCOUNT_LINKING).toMatchObject({
      enabled: true,
      requireLocalEmailVerified: false,
      allowDifferentEmails: true,
      updateUserInfoOnLink: true,
    });
  });

  it("does not trust providers blindly (keeps the provider emailVerified check)", () => {
    expect("trustedProviders" in ACCOUNT_LINKING).toBe(false);
  });

  it("sends MCP sign-in to the landing page", () => {
    expect(AUTH_LOGIN_PAGE).toBe("/");
  });

  it("exposes Apple's trusted origin", () => {
    expect(APPLE_TRUSTED_ORIGIN).toBe("https://appleid.apple.com");
  });
});
