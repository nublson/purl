import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  headers?: Record<string, string>,
): Request {
  return new Request("http://localhost/api/admin/grants", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  });
}

describe("POST /api/admin/grants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ADMIN_TOKEN", "secret-admin-token");
    mockUpsert.mockResolvedValue({});
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
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("returns 401 when x-admin-token does not match", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest(
        { userId: "user-1", until: "2026-12-31T00:00:00.000Z" },
        { "x-admin-token": "wrong-token" },
      ),
    );
    expect(res.status).toBe(401);
    expect(mockUpsert).not.toHaveBeenCalled();
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
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/admin/grants", {
        method: "POST",
        body: "{not-json",
        headers: {
          "content-type": "application/json",
          "x-admin-token": "secret-admin-token",
        },
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON" });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("returns 400 when userId is missing", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest(
        { until: "2026-12-31T00:00:00.000Z" },
        { "x-admin-token": "secret-admin-token" },
      ),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "userId required" });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("returns 400 when until is not a valid ISO date", async () => {
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
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("upserts comp access for a valid grant", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      makeRequest(
        { userId: " user-1 ", until: "2026-12-31T00:00:00.000Z" },
        { "x-admin-token": "secret-admin-token" },
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
