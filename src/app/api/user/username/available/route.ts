import { prisma } from "@/lib/prisma";
import { getBrowserSessionUserId } from "@/lib/require-browser-session";
import { isUsernameTaken } from "@/lib/username-store";
import { validateUsername } from "@/lib/usernames";
import { NextRequest, NextResponse } from "next/server";

/** Checks whether `?u=` is available for the current user to take. */
export async function GET(request: NextRequest) {
  const userId = await getBrowserSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = request.nextUrl.searchParams.get("u") ?? "";
  const check = validateUsername(raw);
  if (!check.ok) {
    return NextResponse.json({ available: false, reason: check.reason });
  }

  const { username } = check;

  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });

  // Session cookie cache can be stale for up to 5 minutes after a rename, so
  // the current username is read fresh from the DB rather than the session.
  if (currentUser?.username === username) {
    return NextResponse.json({ available: true });
  }

  if (await isUsernameTaken(username, userId)) {
    return NextResponse.json({ available: false, reason: "taken" });
  }

  return NextResponse.json({ available: true });
}
