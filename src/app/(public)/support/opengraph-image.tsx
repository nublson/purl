import { SITE_OG_CONTENT_TYPE, SITE_OG_SIZE } from "@/components/site-og-image";
import { staticPageOgAlt, staticPageOgImage } from "@/components/static-page";

// Refreshed with the page (its title and description come from Notion).
export const revalidate = 3600;

export const alt = staticPageOgAlt("support");
export const size = SITE_OG_SIZE;
export const contentType = SITE_OG_CONTENT_TYPE;

export default function Image() {
  return staticPageOgImage("support");
}
