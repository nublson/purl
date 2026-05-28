import { auth } from "@/lib/auth";
import {
  deleteByokKey,
  getByokKey,
  getDecryptedByokKey,
  maskByokKey,
  saveByokKey,
} from "@/lib/user-anthropic-key";
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

  const { hasKey } = await getByokKey(userId);
  let maskedKey: string | null = null;
  if (hasKey) {
    const plain = await getDecryptedByokKey(userId);
    maskedKey = plain ? maskByokKey(plain) : null;
  }

  return NextResponse.json({ hasKey, maskedKey });
}

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let key: string;
  try {
    const body = await request.json();
    key = typeof body.key === "string" ? body.key.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!key) {
    return NextResponse.json({ error: "Key is required" }, { status: 400 });
  }

  try {
    await saveByokKey(userId, key);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to save key";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ maskedKey: maskByokKey(key) });
}

export async function DELETE() {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await deleteByokKey(userId);
  return new Response(null, { status: 204 });
}
