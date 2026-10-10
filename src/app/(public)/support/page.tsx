import { StaticPage, staticPageMetadata } from "@/components/static-page";
import { SupportContact } from "@/components/support-contact";
import { getSupportEmail } from "@/lib/support-email";

// Static, refreshed hourly and whenever Notion's webhook expires the cache.
// The contact address (FEEDBACK_TO_EMAIL) is read when the page is built or
// revalidated.
export const dynamic = "force-static";
export const revalidate = 3600;

export function generateMetadata() {
  return staticPageMetadata("support");
}

export default function Page() {
  return (
    <StaticPage
      slug="support"
      intro={<SupportContact email={getSupportEmail()} />}
    />
  );
}
