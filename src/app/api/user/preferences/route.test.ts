import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PATCH } from "./route";

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

vi.mock("@/lib/user-preferences", () => ({
  getPreferences: vi.fn(),
  updatePreferences: vi.fn(),
}));

const { auth } = await import("@/lib/auth");
const { getPreferences, updatePreferences } = await import(
  "@/lib/user-preferences"
);

const MOCK_SESSION = { user: { id: "user-123" }, session: {} };

function patchRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/user/preferences", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/user/preferences", () => {
  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockReset();
    vi.mocked(getPreferences).mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(getPreferences).not.toHaveBeenCalled();
  });

  it("returns stored preferences for the authenticated user", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    const preferences = { defaultPage: "ai" as const, showChatWidget: false };
    vi.mocked(getPreferences).mockResolvedValue(preferences);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(preferences);
    expect(getPreferences).toHaveBeenCalledWith("user-123");
  });
});

describe("PATCH /api/user/preferences", () => {
  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockReset();
    vi.mocked(updatePreferences).mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);

    const res = await PATCH(patchRequest({ defaultPage: "ai" }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(updatePreferences).not.toHaveBeenCalled();
  });

  it("returns 400 when the request body is invalid JSON", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);

    const res = await PATCH(
      new NextRequest("http://localhost/api/user/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "{not-json",
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid request body" });
    expect(updatePreferences).not.toHaveBeenCalled();
  });

  it("merges and returns updated preferences", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(MOCK_SESSION as never);
    const updated = { defaultPage: "ai" as const, showChatWidget: true };
    vi.mocked(updatePreferences).mockResolvedValue(updated);

    const res = await PATCH(patchRequest({ defaultPage: "ai" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(updated);
    expect(updatePreferences).toHaveBeenCalledWith("user-123", {
      defaultPage: "ai",
    });
  });
});
