import { prisma } from "@/lib/prisma";
import { getBrowserSessionUserId } from "@/lib/require-browser-session";
import { getUsernameChangeRateLimiter } from "@/lib/upstash-rate-limit";
import { isUsernameTaken, setUsername } from "@/lib/username-store";
import { validateUsername } from "@/lib/usernames";
import { NextRequest, NextResponse } from "next/server";

const FORMAT_MESSAGE = "Use 3–30 lowercase letters, numbers, - or _";
const RESERVED_MESSAGE = "That username is reserved";
const TAKEN_MESSAGE = "That username is taken";

/**
 * Updates the current user's username. Better Auth's `username` field is
 * `input: false`, so this is the only path a username can change through.
 */
export async function PATCH(request: NextRequest) {
  const userId = await getBrowserSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { username?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const raw = typeof body?.username === "string" ? body.username : "";
  const check = validateUsername(raw);
  if (!check.ok) {
    return NextResponse.json(
      {
        error: check.reason === "format" ? FORMAT_MESSAGE : RESERVED_MESSAGE,
        code: check.reason === "format" ? "INVALID_FORMAT" : "RESERVED",
      },
      { status: 400 },
    );
  }

  const { username } = check;

  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });

  // Session cookie cache can be stale for up to 5 minutes after a rename, so
  // the current username is read fresh from the DB rather than the session.
  if (currentUser?.username === username) {
    return NextResponse.json({ username }, { status: 200 });
  }

  if (await isUsernameTaken(username, userId)) {
    return NextResponse.json(
      { error: TAKEN_MESSAGE, code: "TAKEN" },
      { status: 409 },
    );
  }

  // Rate-limit actual changes per user (not per IP, and only after the
  // session check): signed-out requests, rejected names and no-op saves don't
  // use up anyone's quota.
  const limiter = getUsernameChangeRateLimiter();
  if (limiter) {
    const { success, reset } = await limiter.limit(userId);
    if (!success) {
      const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Too many username changes. Try again in a while.", code: "RATE_LIMITED" },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }
  }

  const result = await setUsername(userId, username);
  if (result === "taken") {
    return NextResponse.json(
      { error: TAKEN_MESSAGE, code: "TAKEN" },
      { status: 409 },
    );
  }

  return NextResponse.json({ username }, { status: 200 });
}
