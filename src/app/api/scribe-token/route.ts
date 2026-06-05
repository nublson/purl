import { auth } from "@/lib/auth";
import { getElevenLabsClient } from "@/lib/elevenlabs";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const client = getElevenLabsClient();
    const token = await client.tokens.singleUse.create("realtime_scribe");
    return NextResponse.json(token);
  } catch {
    return NextResponse.json({ error: "Failed to create token" }, { status: 500 });
  }
}
