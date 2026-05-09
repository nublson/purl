import prisma from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const token = request.headers.get("x-admin-token")?.trim();
  const expected = process.env.ADMIN_TOKEN?.trim();
  if (!expected || token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { userId?: string; until?: string };
  try {
    body = (await request.json()) as { userId?: string; until?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  const until =
    typeof body.until === "string" && body.until.trim()
      ? new Date(body.until)
      : null;
  if (!until || Number.isNaN(until.getTime())) {
    return NextResponse.json(
      { error: "until must be a valid ISO date string" },
      { status: 400 },
    );
  }

  await prisma.subscription.upsert({
    where: { userId },
    create: {
      userId,
      planKey: "FREE",
      status: "ACTIVE",
      compUntil: until,
    },
    update: { compUntil: until },
  });

  return NextResponse.json({ ok: true, userId, compUntil: until.toISOString() });
}
