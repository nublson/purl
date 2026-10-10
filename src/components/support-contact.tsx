import { NotionAnchor } from "@/components/notion-blocks/rich-text";
import { Typography } from "@/components/typography";

const ISSUES_URL = "https://github.com/nublson/purl/issues";

/**
 * How to reach us, at the top of the support page (the Chrome Web Store links
 * here). The address comes from FEEDBACK_TO_EMAIL, not from Notion, so it
 * stays the one inbox in-app feedback goes to; without one, the card points
 * at Feedback and GitHub.
 */
export function SupportContact({ email }: { email: string | null }) {
  return (
    <section
      aria-labelledby="support-contact-title"
      className="flex flex-col gap-2 rounded-lg bg-card p-4"
    >
      <Typography
        variant="h3"
        component="h2"
        id="support-contact-title"
        className="text-xl"
      >
        Contact us
      </Typography>
      {email ? (
        <>
          <Typography className="text-foreground">
            Tell us what happened and what you were doing, and include the
            address of the page if it’s about a saved link.
          </Typography>
          <Typography className="text-foreground">
            <NotionAnchor
              link={{
                href: `mailto:${email}?subject=${encodeURIComponent("Purl support")}`,
                external: false,
              }}
            >
              {email}
            </NotionAnchor>
          </Typography>
        </>
      ) : (
        <Typography className="text-foreground">
          Send <strong>Feedback</strong> from the account menu in Purl, or{" "}
          <NotionAnchor link={{ href: ISSUES_URL, external: true }}>
            open an issue on GitHub
          </NotionAnchor>
          .
        </Typography>
      )}
    </section>
  );
}
