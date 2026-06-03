import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const key = await auth.api.createApiKey({
    body: {
      name: body.name ?? "API Key",
      userId: session.user.id,
    },
  });

  return NextResponse.json(key, { status: 201 });
}

export async function GET(_request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // listApiKeys scopes results to the session user automatically via the session
  // cookie in headers — the plugin enforces ownership; no extra userId filter needed.
  const result = await auth.api.listApiKeys({
    headers: await headers(),
  });

  return NextResponse.json(result);
}
