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

export default async function OAuthConsentPage({
  searchParams,
}: {
  searchParams: Promise<{
    consent_code?: string;
    client_id?: string;
    scope?: string;
  }>;
}) {
  // Signed in only: the proxy just looks for a session cookie.
  const user = await getSessionUser();
  if (!user) redirect("/");

  const {
    consent_code: consentCode,
    client_id: clientId,
    scope,
  } = await searchParams;

  if (!consentCode || !clientId) {
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

  const client = await prisma.oauthApplication.findUnique({
    where: { clientId },
    select: { name: true },
  });

  return (
    <OAuthConsentCard
      clientName={client?.name ?? "This app"}
      scopes={scope ? scope.split(" ") : []}
      user={{ name: user.name, username: user.username, image: user.image }}
      consentCode={consentCode}
    />
  );
}
