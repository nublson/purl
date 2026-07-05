import { OAuthConsentActions } from "@/components/oauth-consent-actions";
import { Typography } from "@/components/typography";
import prisma from "@/lib/prisma";

export default async function OAuthConsentPage({
  searchParams,
}: {
  searchParams: Promise<{
    consent_code?: string;
    client_id?: string;
    scope?: string;
  }>;
}) {
  const {
    consent_code: consentCode,
    client_id: clientId,
    scope,
  } = await searchParams;

  if (!consentCode || !clientId) {
    return (
      <div className="wrapper-private flex flex-1 flex-col items-center justify-center gap-2 pb-12 pt-24">
        <Typography variant="h2" component="h1">
          Invalid authorization request
        </Typography>
        <Typography size="small" className="text-muted-foreground">
          This link is missing required information. Please restart the
          connection from your MCP client.
        </Typography>
      </div>
    );
  }

  const client = await prisma.oauthApplication.findUnique({
    where: { clientId },
    select: { name: true },
  });
  const clientName = client?.name ?? "This App";
  const scopes = scope ? scope.split(" ") : [];

  return (
    <div className="wrapper-private flex flex-1 flex-col items-center justify-center gap-6 pb-12 pt-24">
      <div className="flex flex-col items-center gap-2 text-center">
        <Typography variant="h2" component="h1">
          Authorize {clientName}
        </Typography>
        <Typography size="small" className="text-muted-foreground max-w-md">
          {clientName} wants to access your Purl account
          {scopes.length > 0 ? ` (${scopes.join(", ")})` : ""}. It will be able
          to search, save, and read your saved content on your behalf.
        </Typography>
      </div>
      <OAuthConsentActions consentCode={consentCode} />
    </div>
  );
}
