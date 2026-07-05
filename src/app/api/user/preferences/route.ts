import { getBrowserSessionUserId } from "@/lib/require-browser-session";
import {
  getPreferences,
  updatePreferences,
  type UserPreferences,
} from "@/lib/user-preferences";
import { NextResponse } from "next/server";

export async function GET() {
  const userId = await getBrowserSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const preferences = await getPreferences(userId);
  return NextResponse.json(preferences);
}

export async function PATCH(request: Request) {
  const userId = await getBrowserSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let patch: Partial<UserPreferences>;
  try {
    patch = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const updated = await updatePreferences(userId, patch);
  return NextResponse.json(updated);
}
