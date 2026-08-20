import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockUpsert = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    subscription: {
      upsert: mockUpsert,
    },
  },
}));

function makeRequest(
  body: unknown,
  token?: string,
): NextRequest {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (token !== undefined) {
    headers["x-admin-token"] = token;
  }
  return new NextRequest("http://localhost/api/admin/grants", {
    method: "POST",
    body: JSON.stringify(body),
    headers,
  });
}

describe("POST /api/admin/grants", () => {
  const originalAdminToken = process.env.ADMIN_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_TOKEN = "secret-admin-token";
    mockUpsert.mockResolvedValue({});
  });

  afterEach(() => {
    if (originalAdminToken === undefined) {
      delete process.env.ADMIN_TOKEN;
    } else {
      process.env.ADMIN_TOKEN = originalAdminToken;
    }
  });

  it("returns 401 when x-admin-token is missing", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ userId: "user-1", until: "2026-12-31" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("returns 401 when x-admin-token does not match ADMIN_TOKEN", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({ userId: "user-1", until: "2026-12-31" }, "wrong-token"),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("returns 401 when ADMIN_TOKEN is not configured", async () => {
    delete process.env.ADMIN_TOKEN;
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({ userId: "user-1", until: "2026-12-31" }, "secret-admin-token"),
    );
    expect(res.status).toBe(401);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON", async () => {
    const { POST } = await import("./route");
    const req = new NextRequest("http://localhost/api/admin/grants", {
      method: "POST",
      body: "not-json",
      headers: {
        "content-type": "application/json",
        "x-admin-token": "secret-admin-token",
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON" });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("returns 400 when userId is missing or blank", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({ until: "2026-12-31" }, "secret-admin-token"),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "userId required" });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("returns 400 when until is missing or invalid", async () => {
    const { POST } = await import("./route");

    const missingUntil = await POST(
      makeRequest({ userId: "user-1" }, "secret-admin-token"),
    );
    expect(missingUntil.status).toBe(400);
    expect(await missingUntil.json()).toEqual({
      error: "until must be a valid ISO date string",
    });

    const invalidUntil = await POST(
      makeRequest({ userId: "user-1", until: "not-a-date" }, "secret-admin-token"),
    );
    expect(invalidUntil.status).toBe(400);
    expect(await invalidUntil.json()).toEqual({
      error: "until must be a valid ISO date string",
    });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("upserts compUntil and returns ok payload", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest(
        { userId: "  user-1  ", until: "2026-12-31T00:00:00.000Z" },
        "secret-admin-token",
      ),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      userId: "user-1",
      compUntil: "2026-12-31T00:00:00.000Z",
    });
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      create: {
        userId: "user-1",
        planKey: "FREE",
        status: "ACTIVE",
        compUntil: new Date("2026-12-31T00:00:00.000Z"),
      },
      update: { compUntil: new Date("2026-12-31T00:00:00.000Z") },
    });
  });
});
