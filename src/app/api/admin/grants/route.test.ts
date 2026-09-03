import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockSubscriptionUpsert = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  default: {
    subscription: {
      upsert: mockSubscriptionUpsert,
    },
  },
}));

function makeRequest(
  body: unknown,
  headers?: Record<string, string>,
): Request {
  return new Request("http://localhost/api/admin/grants", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/grants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ADMIN_TOKEN", "secret-admin-token");
    mockSubscriptionUpsert.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 401 when x-admin-token is missing", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest({ userId: "user-1", until: "2026-12-31T00:00:00.000Z" }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockSubscriptionUpsert).not.toHaveBeenCalled();
  });

  it("returns 401 when x-admin-token does not match ADMIN_TOKEN", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest(
        { userId: "user-1", until: "2026-12-31T00:00:00.000Z" },
        { "x-admin-token": "wrong-token" },
      ),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mockSubscriptionUpsert).not.toHaveBeenCalled();
  });

  it("returns 401 when ADMIN_TOKEN is not configured", async () => {
    vi.stubEnv("ADMIN_TOKEN", "");
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest(
        { userId: "user-1", until: "2026-12-31T00:00:00.000Z" },
        { "x-admin-token": "secret-admin-token" },
      ),
    );
    expect(res.status).toBe(401);
    expect(mockSubscriptionUpsert).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/admin/grants", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-token": "secret-admin-token",
        },
        body: "not-json",
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON" });
    expect(mockSubscriptionUpsert).not.toHaveBeenCalled();
  });

  it("returns 400 when userId is missing or blank", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest(
        { until: "2026-12-31T00:00:00.000Z" },
        { "x-admin-token": "secret-admin-token" },
      ),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "userId required" });
    expect(mockSubscriptionUpsert).not.toHaveBeenCalled();
  });

  it("returns 400 when until is missing or not a valid date", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest(
        { userId: "user-1", until: "not-a-date" },
        { "x-admin-token": "secret-admin-token" },
      ),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "until must be a valid ISO date string",
    });
    expect(mockSubscriptionUpsert).not.toHaveBeenCalled();
  });

  it("upserts compUntil on the subscription row for a valid request", async () => {
    const { POST } = await import("./route");
    const until = "2026-12-31T00:00:00.000Z";
    const res = await POST(
      makeRequest(
        { userId: "user-1", until },
        { "x-admin-token": "secret-admin-token" },
      ),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      userId: "user-1",
      compUntil: until,
    });
    expect(mockSubscriptionUpsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      create: {
        userId: "user-1",
        planKey: "FREE",
        status: "ACTIVE",
        compUntil: new Date(until),
      },
      update: { compUntil: new Date(until) },
    });
  });
});
