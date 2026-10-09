import { createHmac, timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";
import { NOTION_CACHE_TAG } from "@/lib/notion";

export const runtime = "nodejs";

function safeEqual(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** `X-Notion-Signature`: `sha256=` + HMAC-SHA256 of the raw body, keyed by the verification token. */
function notionSignatureMatches(
  body: string,
  signature: string,
  verificationToken: string,
): boolean {
  const expected = `sha256=${createHmac("sha256", verificationToken).update(body).digest("hex")}`;
  return safeEqual(signature, expected);
}

/** Shared secret as `Authorization: Bearer` or `?secret=` (manual refreshes). */
function manualSecretMatches(request: NextRequest): boolean {
  const expected = process.env.NOTION_REVALIDATION_SECRET?.trim();
  if (!expected) return false;
  const bearer = request.headers
    .get("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1];
  const given = (bearer ?? request.nextUrl.searchParams.get("secret"))?.trim();
  return Boolean(given) && safeEqual(given!, expected);
}

function readVerificationToken(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (parsed && typeof parsed === "object" && "verification_token" in parsed) {
      const token = (parsed as { verification_token: unknown }).verification_token;
      return typeof token === "string" ? token : null;
    }
  } catch {
    /* not JSON */
  }
  return null;
}

/**
 * Expires every cached Notion read so the static pages show an edit on their
 * next visit. Called by:
 * - a Notion integration webhook subscription (page events), signed with
 *   `X-Notion-Signature` using its verification token, `NOTION_WEBHOOK_SECRET`.
 *   Creating the subscription first POSTs `{ verification_token }` unsigned:
 *   it's logged so it can be pasted back into Notion (and into the env var);
 * - by hand, with `NOTION_REVALIDATION_SECRET` as `?secret=` or a Bearer token.
 * Event bodies are ignored: the pages are few, so everything is refreshed.
 */
export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("x-notion-signature");
  const webhookSecret = process.env.NOTION_WEBHOOK_SECRET?.trim();

  if (signature) {
    if (!webhookSecret || !notionSignatureMatches(body, signature, webhookSecret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (!manualSecretMatches(request)) {
    const verificationToken = readVerificationToken(body);
    if (verificationToken) {
      // Anyone can send this; it changes nothing, it only surfaces the token.
      console.info(
        `[notion] Webhook verification token: ${verificationToken} — paste it into the subscription's Verify dialog and set NOTION_WEBHOOK_SECRET to it.`,
      );
      return NextResponse.json({ received: true });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Expire now (not stale-while-revalidate): the next visit renders the edit.
  revalidateTag(NOTION_CACHE_TAG, { expire: 0 });

  return NextResponse.json({ revalidated: true, now: Date.now() });
}
