import { describe, expect, it } from "vitest";
import { signInErrorMessage } from "./sign-in-errors";

describe("signInErrorMessage", () => {
  it("maps account_not_linked", () =>
    expect(signInErrorMessage("account_not_linked")).toMatch(
      /already linked|same email/i,
    ));

  it("maps access_denied", () =>
    expect(signInErrorMessage("access_denied")).toBe(
      "Sign-in was cancelled.",
    ));

  it("falls back for unknown codes", () =>
    expect(signInErrorMessage("weird_code")).toBe(
      "We couldn't sign you in. Try again.",
    ));

  it("returns null without a code", () =>
    expect(signInErrorMessage(null)).toBeNull());
});
