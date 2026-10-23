import "server-only";

import { fetchImageAsDataUrl } from "@/lib/og-images";
import {
  BACKGROUND,
  CARD,
  FOREGROUND,
  GLOBE_SVG,
  HAIRLINE,
  LOGO_SVG,
  MUTED,
  TINT,
  loadInter,
} from "@/lib/og-theme";
import { ImageResponse } from "next/og";

/**
 * The site's link preview (the landing page and the static pages): the Purl
 * mark, a headline and a line under it on the left, the domain at the
 * bottom, and, on the landing page's only, a few saved links on the right
 * as the grid view's cards in three staggered columns, fading in from
 * behind the text. The links are a
 * fixed, hand-picked set (`SHOWCASE_LINKS`), not anyone's account.
 * Thumbnails and favicons are fetched through `safeFetch` and inlined
 * (`src/lib/og-images.ts`); one that can't be fetched falls back to the
 * favicon (else a globe) on a tint, like the grid.
 */

export const SITE_OG_SIZE = { width: 1200, height: 630 };
export const SITE_OG_CONTENT_TYPE = "image/png";

type ShowcaseLink = {
  title: string;
  domain: string;
  thumbnail: string;
  /** A PNG the renderer can draw (it can't read .ico or SVG favicons). */
  favicon: string;
};

/** Google's favicon service, for sites whose own favicon is an .ico or SVG. */
function googleFavicon(domain: string) {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

/**
 * The cards, column by column (top to bottom). The first column sits mostly
 * under the fade, so it holds the quieter thumbnails; the brightest photos
 * get the middle one. Titles are each page's own preview title.
 */
const SHOWCASE_LINKS: ShowcaseLink[][] = [
  [
    {
      title: "AI Code Reviews: The Ultimate Guide",
      domain: "greptile.com",
      thumbnail: "https://greptile.com/opengraph/what-is-ai-code-review-og.png",
      favicon: googleFavicon("greptile.com"),
    },
    {
      title: "notionic: A Notion renderer for React Server Components",
      domain: "notionic.dev",
      thumbnail: "https://notionic.dev/opengraph-image?1326a8da2aedee2d",
      favicon: "https://notionic.dev/apple-icon.png",
    },
  ],
  [
    {
      title: "Closing Out Before Vacation & Getting My First MacBook",
      domain: "youtube.com",
      thumbnail: "https://i.ytimg.com/vi/MhW6BsUhTRw/maxresdefault.jpg",
      favicon: googleFavicon("youtube.com"),
    },
    {
      title: "AI Agents Won’t Replace You. But They Will Expose You.",
      domain: "nublson.com",
      thumbnail:
        "https://images.unsplash.com/photo-1617544518238-492c0c419a6d?ixlib=rb-4.1.0&q=85&fm=jpg&crop=entropy&cs=srgb&w=800",
      favicon: "https://nublson.com/apple-icon.png",
    },
  ],
  [
    {
      title: "Web Interface Guidelines",
      domain: "interfaces.rauno.me",
      thumbnail: "https://interfaces.rauno.me/og.png",
      favicon: googleFavicon("interfaces.rauno.me"),
    },
    {
      title: "Letter Glitch — React Background",
      domain: "reactbits.dev",
      thumbnail: "https://reactbits.dev/og/backgrounds/letter-glitch.jpg",
      favicon: googleFavicon("reactbits.dev"),
    },
  ],
];

// Layout: 72px margins; the text in a 400px column on the left, the cards
// in 260px columns from x = 500, running off the right edge. Each column
// starts at its own height so the cards don't line up in rows.
const PADDING = 72;
const TEXT_WIDTH = 400;
/** Without the cards, the text may use the width (a static page's). */
const WIDE_TEXT_WIDTH = 860;
const WALL_LEFT = 500;
const CARD_WIDTH = 260;
const GUTTER = 20;
const COLUMN_OFFSETS = [-70, 40, -20];
const MEDIA_HEIGHT = Math.round((CARD_WIDTH * 10) / 16);
const DIM = "#737373";

type Card = ShowcaseLink & {
  thumbnailData: string | null;
  faviconData: string | null;
};

/** One grid-view card (`SharedLinkCard`): thumbnail, favicon, title, domain. */
function ShowcaseCard({ title, domain, thumbnailData, faviconData }: Card) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: CARD_WIDTH,
        borderRadius: 16,
        overflow: "hidden",
        background: CARD,
        border: `1px solid ${HAIRLINE}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: CARD_WIDTH,
          height: MEDIA_HEIGHT,
          background: TINT,
        }}
      >
        {thumbnailData ? (
          <img
            src={thumbnailData}
            width={CARD_WIDTH}
            height={MEDIA_HEIGHT}
            alt=""
            style={{ objectFit: "cover" }}
          />
        ) : (
          <img src={faviconData ?? GLOBE_SVG} width={44} height={44} alt="" />
        )}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: "14px 16px 16px",
        }}
      >
        <div style={{ display: "flex", gap: 10 }}>
          <div
            style={{ display: "flex", width: 16, height: 21, alignItems: "center" }}
          >
            <img
              src={faviconData ?? GLOBE_SVG}
              width={16}
              height={16}
              alt=""
              style={{ borderRadius: 4 }}
            />
          </div>
          <div
            style={{
              display: "block",
              lineClamp: 3,
              width: CARD_WIDTH - 32 - 26,
              fontSize: 16,
              fontWeight: 500,
              lineHeight: 1.3,
              color: FOREGROUND,
            }}
          >
            {title}
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 14, color: DIM }}>{domain}</div>
      </div>
    </div>
  );
}

/** The site's host, as the image's footer shows it (`purl.live`). */
function siteHost() {
  try {
    return new URL(process.env.BASE_URL as string).host;
  } catch {
    return "purl.live";
  }
}

/**
 * The preview image with `title` as its headline and `description` under it
 * (left out when empty); `showcase` adds the link cards (the landing page's).
 * Long headlines beside the cards step down a size so they keep to three
 * lines.
 */
export async function renderSiteOgImage({
  title,
  description,
  showcase = false,
}: {
  title: string;
  description?: string | null;
  showcase?: boolean;
}) {
  const [columns, fonts] = await Promise.all([
    Promise.all(
      (showcase ? SHOWCASE_LINKS : []).map((column) =>
        Promise.all(
          column.map(async (link): Promise<Card> => {
            const [thumbnailData, faviconData] = await Promise.all([
              fetchImageAsDataUrl(link.thumbnail),
              fetchImageAsDataUrl(link.favicon),
            ]);
            return { ...link, thumbnailData, faviconData };
          }),
        ),
      ),
    ),
    loadInter(),
  ]);
  const headlineSize = showcase && title.length > 28 ? 52 : 64;

  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          display: "flex",
          background: BACKGROUND,
          color: FOREGROUND,
          fontFamily: "Inter",
        }}
      >
        {showcase ? (
          <>
          <div
            style={{
              position: "absolute",
              left: WALL_LEFT,
              top: 0,
              display: "flex",
              gap: GUTTER,
            }}
          >
            {columns.map((column, index) => (
              <div
                key={index}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: GUTTER,
                  marginTop: COLUMN_OFFSETS[index],
                }}
              >
                {column.map((card) => (
                  <ShowcaseCard key={card.title} {...card} />
                ))}
              </div>
            ))}
          </div>
          {/* The cards fade in from behind the text, and a little at the
              bottom edge. */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: SITE_OG_SIZE.width,
              height: SITE_OG_SIZE.height,
              display: "flex",
              backgroundImage: `linear-gradient(90deg, ${BACKGROUND} 38%, rgba(10, 10, 10, 0.75) 50%, rgba(10, 10, 10, 0) 68%)`,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: SITE_OG_SIZE.width,
              height: SITE_OG_SIZE.height,
              display: "flex",
              backgroundImage:
                "linear-gradient(180deg, rgba(10, 10, 10, 0) 82%, rgba(10, 10, 10, 0.6) 100%)",
            }}
          />
          </>
        ) : null}
        <div
          style={{
            position: "absolute",
            left: PADDING,
            top: PADDING,
            bottom: PADDING,
            width: showcase ? TEXT_WIDTH : WIDE_TEXT_WIDTH,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: -0.56,
            }}
          >
            <img src={LOGO_SVG} width={36} height={36} alt="" />
            Purl
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <div
              style={{
                display: "block",
                lineClamp: 3,
                fontSize: headlineSize,
                fontWeight: 600,
                lineHeight: 1.04,
                letterSpacing: headlineSize * -0.04,
              }}
            >
              {title}
            </div>
            {description ? (
              <div
                style={{
                  display: "block",
                  lineClamp: 3,
                  fontSize: 25,
                  lineHeight: 1.4,
                  letterSpacing: -0.25,
                  color: MUTED,
                }}
              >
                {description}
              </div>
            ) : null}
          </div>
          <div style={{ display: "flex", fontSize: 20, color: DIM }}>
            {siteHost()}
          </div>
        </div>
      </div>
    ),
    { ...SITE_OG_SIZE, fonts: fonts.length ? fonts : undefined },
  );
}
