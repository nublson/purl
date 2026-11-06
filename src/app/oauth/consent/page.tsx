import type { Metadata } from "next";
import {
  CONSENT_COLUMN,
  OAuthConsentCard,
} from "@/components/oauth-consent-card";
import { BrandMark } from "@/components/brand-mark";
import { Typography } from "@/components/typography";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Allow access" };

function searchParam(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Rebuilds the signed authorize query the consent POST must send back. */
function oauthQueryFromSearchParams(
  params: Record<string, string | string[] | undefined>,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.append(key, value);
    else if (Array.isArray(value)) for (const item of value) query.append(key, item);
  }
  return query.toString();
}

export default async function OAuthConsentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Signed in only: the proxy just looks for a session cookie.
  const user = await getSessionUser();
  if (!user) redirect("/");

  const params = await searchParams;
  const clientId = searchParam(params.client_id);
  const scope = searchParam(params.scope);
  const oauthQuery = oauthQueryFromSearchParams(params);

  if (!clientId || !searchParam(params.sig)) {
    return (
      <div className={CONSENT_COLUMN}>
        <BrandMark />
        <Typography variant="h3" component="h1" className="mt-8 md:text-3xl">
          This link is incomplete
        </Typography>
        <Typography className="mt-3 text-pretty">
          Start the connection again from the app you’re connecting.
        </Typography>
      </div>
    );
  }

  const client = await prisma.oauthClient.findUnique({
    where: { clientId },
    select: { name: true },
  });

  return (
    <OAuthConsentCard
      clientName={client?.name ?? "This app"}
      scopes={scope ? scope.split(" ") : []}
      user={{ name: user.name, username: user.username, image: user.image }}
      oauthQuery={oauthQuery}
    />
  );
}
