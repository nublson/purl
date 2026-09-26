import { describe, expect, it } from "vitest";
import { connectErrorMessage, signInErrorMessage } from "./sign-in-errors";

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

describe("connectErrorMessage", () => {
  it("maps account_already_linked_to_different_user", () =>
    expect(connectErrorMessage("account_already_linked_to_different_user")).toBe(
      "That account is already used by another Purl account.",
    ));

  it("maps unable_to_link_account", () =>
    expect(connectErrorMessage("unable_to_link_account")).toBe(
      "We couldn't connect that account. Make sure its email is verified.",
    ));

  it("maps access_denied", () =>
    expect(connectErrorMessage("access_denied")).toBe(
      "Connection was cancelled.",
    ));

  it("falls back for unknown codes", () =>
    expect(connectErrorMessage("invalid_code")).toBe(
      "We couldn't connect that account. Try again.",
    ));

  it("returns null without a code", () =>
    expect(connectErrorMessage(null)).toBeNull());
});
