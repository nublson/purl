import { BrandMark } from "@/components/brand-mark";
import { OAuthConsentActions } from "@/components/oauth-consent-actions";
import { Typography } from "@/components/typography";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { describeAccess } from "@/lib/oauth-scopes";
import { Check } from "reicon-react";

/** The consent screen's column, on the static pages' measure. */
export const CONSENT_COLUMN = "mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-12";

type ConsentUser = { name: string; username: string; image: string | null };

/** What an app is asking for, who is signed in, and the Allow / Deny choice. */
export function OAuthConsentCard({
  clientName,
  scopes,
  user,
  consentCode,
}: {
  clientName: string;
  scopes: string[];
  user: ConsentUser;
  consentCode: string;
}) {
  return (
    <div className={CONSENT_COLUMN}>
      <BrandMark />
      <Typography
        variant="h3"
        component="h1"
        className="mt-8 wrap-anywhere md:text-3xl"
      >
        Allow {clientName} to access your Purl account?
      </Typography>
      <div className="mt-4 flex items-center gap-2">
        <Avatar className="size-6">
          <AvatarImage src={user.image ?? ""} alt="" />
          <AvatarFallback className="text-xs">
            {user.name.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <Typography size="small">
          Signed in as{" "}
          <span className="font-medium text-foreground">@{user.username}</span>
        </Typography>
      </div>
      <section aria-labelledby="consent-access" className="mt-8">
        <Typography
          component="h2"
          size="small"
          id="consent-access"
          className="font-medium"
        >
          It will be able to
        </Typography>
        <ul className="mt-3 flex flex-col gap-3">
          {describeAccess(scopes).map((item) => (
            <li key={item} className="flex items-start gap-3">
              <span aria-hidden="true" className="mt-1 flex text-muted-foreground">
                <Check size={16} />
              </span>
              <Typography
                component="span"
                className="text-pretty text-foreground"
              >
                {item}
              </Typography>
            </li>
          ))}
        </ul>
      </section>
      <div className="mt-10">
        <OAuthConsentActions consentCode={consentCode} />
      </div>
      <Typography size="small" className="mt-6 text-pretty">
        You can disconnect {clientName} at any time in Settings, under
        Integrations.
      </Typography>
    </div>
  );
}
