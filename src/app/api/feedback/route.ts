import { auth } from "@/lib/auth";
import { getResend } from "@/lib/resend";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const MAX_FEEDBACK_LENGTH = 10_000;
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

function parseFeedbackRecipients(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function readIdempotencyKey(request: NextRequest): string | null {
  const key = request.headers.get("idempotency-key");
  if (!key?.trim()) return null;
  const trimmed = key.trim();
  if (trimmed.length > MAX_IDEMPOTENCY_KEY_LENGTH) return null;
  return trimmed;
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const idempotencyClientKey = readIdempotencyKey(request);
  if (!idempotencyClientKey) {
    return NextResponse.json(
      { error: "Idempotency-Key header is required" },
      { status: 400 },
    );
  }

  let body: { feedback?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const feedback =
    typeof body.feedback === "string" ? body.feedback.trim() : "";
  if (!feedback) {
    return NextResponse.json({ error: "Feedback is required" }, { status: 400 });
  }
  if (feedback.length > MAX_FEEDBACK_LENGTH) {
    return NextResponse.json({ error: "Feedback is too long" }, { status: 400 });
  }

  const user = session.user;
  const userEmail = user.email;
  if (!userEmail) {
    return NextResponse.json(
      { error: "Your account has no email address" },
      { status: 400 },
    );
  }

  const to = parseFeedbackRecipients(process.env.FEEDBACK_TO_EMAIL);
  if (to.length === 0) {
    console.error("FEEDBACK_TO_EMAIL is not set or empty.");
    return NextResponse.json(
      { error: "Feedback is temporarily unavailable" },
      { status: 503 },
    );
  }

  const resend = getResend();
  if (!resend) {
    console.error("RESEND_API_KEY is not set; cannot send feedback.");
    return NextResponse.json(
      { error: "Feedback is temporarily unavailable" },
      { status: 503 },
    );
  }

  const from = process.env.RESEND_FROM ?? "Purl <onboarding@resend.dev>";
  const displayName = user.name?.trim() || userEmail;
  const subject = `[Purl feedback] from ${displayName}`;

  const lines = [
    `User id: ${user.id}`,
    `Email: ${userEmail}`,
    ...(user.name?.trim() ? [`Name: ${user.name.trim()}`] : []),
    "",
    feedback,
  ];
  const text = lines.join("\n");

  const { error } = await resend.emails.send(
    {
      from,
      to: to.length === 1 ? to[0]! : to,
      reply_to: userEmail,
      subject,
      text,
    },
    {
      idempotencyKey: `feedback/${user.id}/${idempotencyClientKey}`,
    },
  );

  if (error) {
    console.error("Failed to send feedback email:", error.message);
    return NextResponse.json(
      { error: "Failed to send feedback" },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
