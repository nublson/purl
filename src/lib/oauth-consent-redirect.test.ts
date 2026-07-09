import { describe, expect, it } from "vitest";
import { requireConsentRedirectUri } from "./oauth-consent-redirect";

describe("requireConsentRedirectUri", () => {
  it("returns the redirect URI when present", () => {
    expect(
      requireConsentRedirectUri({
        redirectURI: "https://client.example/callback?code=abc",
      }),
    ).toBe("https://client.example/callback?code=abc");
  });

  it("throws when redirectURI is missing", () => {
    expect(() => requireConsentRedirectUri({})).toThrow(
      "No redirect URL returned",
    );
  });

  it("throws when redirectURI is an empty string", () => {
    expect(() => requireConsentRedirectUri({ redirectURI: "" })).toThrow(
      "No redirect URL returned",
    );
  });
});
