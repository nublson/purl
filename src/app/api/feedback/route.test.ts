import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

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

const sendMock = vi.fn();

vi.mock("@/lib/resend", () => ({
  getResend: vi.fn(() => ({
    emails: { send: sendMock },
  })),
}));

const { auth } = await import("@/lib/auth");
const { getResend } = await import("@/lib/resend");

const MOCK_USER = {
  id: "user-123",
  email: "user@example.com",
  name: "Test User",
};

function postRequest(
  body: unknown,
  headersInit?: Record<string, string>,
): NextRequest {
  const h = new Headers({ "Content-Type": "application/json" });
  if (headersInit) {
    for (const [k, v] of Object.entries(headersInit)) {
      h.set(k, v);
    }
  }
  return new NextRequest("http://localhost/api/feedback", {
    method: "POST",
    headers: h,
    body: JSON.stringify(body),
  });
}

describe("POST /api/feedback", () => {
  const prevFeedbackTo = process.env.FEEDBACK_TO_EMAIL;

  beforeEach(() => {
    vi.mocked(auth.api.getSession).mockReset();
    sendMock.mockReset();
    vi.mocked(getResend).mockReset();
    vi.mocked(getResend).mockReturnValue({
      emails: { send: sendMock },
    } as never);
    process.env.FEEDBACK_TO_EMAIL = "owner@example.com";
  });

  afterEach(() => {
    if (prevFeedbackTo === undefined) {
      delete process.env.FEEDBACK_TO_EMAIL;
    } else {
      process.env.FEEDBACK_TO_EMAIL = prevFeedbackTo;
    }
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);

    const res = await POST(
      postRequest(
        { feedback: "hello" },
        { "idempotency-key": "550e8400-e29b-41d4-a716-446655440000" },
      ),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns 400 when Idempotency-Key is missing", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: MOCK_USER,
      session: {},
    } as never);

    const res = await POST(postRequest({ feedback: "hello" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Idempotency-Key header is required",
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns 400 when Idempotency-Key is too long", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: MOCK_USER,
      session: {},
    } as never);

    const res = await POST(
      postRequest(
        { feedback: "hello" },
        { "idempotency-key": "x".repeat(129) },
      ),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Idempotency-Key header is required",
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: MOCK_USER,
      session: {},
    } as never);

    const req = new NextRequest("http://localhost/api/feedback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "idempotency-key": "key-1",
      },
      body: "not-json",
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns 400 when feedback is empty", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: MOCK_USER,
      session: {},
    } as never);

    const res = await POST(
      postRequest({ feedback: "   " }, { "idempotency-key": "key-1" }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Feedback is required" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns 400 when feedback is too long", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: MOCK_USER,
      session: {},
    } as never);

    const res = await POST(
      postRequest(
        { feedback: "a".repeat(10_001) },
        { "idempotency-key": "key-1" },
      ),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Feedback is too long" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns 400 when user has no email", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: "u1", email: "" },
      session: {},
    } as never);

    const res = await POST(
      postRequest({ feedback: "hello" }, { "idempotency-key": "key-1" }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Your account has no email address",
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns 503 when FEEDBACK_TO_EMAIL is unset", async () => {
    delete process.env.FEEDBACK_TO_EMAIL;
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: MOCK_USER,
      session: {},
    } as never);

    const res = await POST(
      postRequest({ feedback: "hello" }, { "idempotency-key": "key-1" }),
    );

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: "Feedback is temporarily unavailable",
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns 503 when Resend is not configured", async () => {
    vi.mocked(getResend).mockReturnValue(null);
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: MOCK_USER,
      session: {},
    } as never);

    const res = await POST(
      postRequest({ feedback: "hello" }, { "idempotency-key": "key-1" }),
    );

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: "Feedback is temporarily unavailable",
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns 201 and sends email when configured", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: MOCK_USER,
      session: {},
    } as never);
    sendMock.mockResolvedValue({ data: { id: "email-1" }, error: null });

    const res = await POST(
      postRequest(
        { feedback: "Great app" },
        { "idempotency-key": "idem-abc" },
      ),
    );

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@example.com",
        replyTo: "user@example.com",
        subject: "[Purl feedback] from Test User",
        text: expect.stringContaining("Great app"),
      }),
      { idempotencyKey: "feedback/user-123/idem-abc" },
    );
  });

  it("returns 502 when Resend returns an error", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: MOCK_USER,
      session: {},
    } as never);
    sendMock.mockResolvedValue({
      data: null,
      error: { message: "bounce" },
    });

    const res = await POST(
      postRequest({ feedback: "x" }, { "idempotency-key": "key-2" }),
    );

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Failed to send feedback" });
  });
});
