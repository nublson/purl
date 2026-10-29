import {
  SITE_OG_CONTENT_TYPE,
  SITE_OG_SIZE,
  renderSiteOgImage,
} from "@/components/site-og-image";

/**
 * The site's preview image (the landing page, and any page without its own):
 * the landing hero's headline and line, beside a few saved links. Rebuilt
 * daily, so a thumbnail that couldn't be fetched at build comes back.
 */
export const revalidate = 86400;

export const alt = "Purl: a home for your pearls, beside a few saved pearls";
export const size = SITE_OG_SIZE;
export const contentType = SITE_OG_CONTENT_TYPE;

export default function Image() {
  return renderSiteOgImage({
    title: "A home for your pearls.",
    description:
      "Save the links and files worth keeping. Share a folder when one’s worth passing on.",
    showcase: true,
  });
}
