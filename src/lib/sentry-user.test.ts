import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSetUser = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  setUser: mockSetUser,
}));

const { setSentryUser } = await import("./sentry-user");

describe("setSentryUser", () => {
  beforeEach(() => {
    mockSetUser.mockReset();
  });

  it("tags the scope with the user id only", () => {
    setSentryUser("user-abc");
    expect(mockSetUser).toHaveBeenCalledWith({ id: "user-abc" });
  });

  it("clears the user on sign-out", () => {
    setSentryUser(null);
    expect(mockSetUser).toHaveBeenCalledWith(null);
  });
});
