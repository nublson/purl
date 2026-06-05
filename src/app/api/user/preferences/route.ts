import { auth } from "@/lib/auth";
import {
  getPreferences,
  updatePreferences,
  type UserPreferences,
} from "@/lib/user-preferences";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

async function getAuthenticatedUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user?.id ?? null;
}

export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const preferences = await getPreferences(userId);
  return NextResponse.json(preferences);
}

export async function PATCH(request: Request) {
  const userId = await getAuthenticatedUserId();
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
