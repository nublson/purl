import { fetchImageAsDataUrl } from "@/lib/og-images";
import {
  countPublicFolderLinks,
  listPublicFolderLinks,
  resolvePublicFolder,
  type PublicLink,
} from "@/lib/public-folders";
import { formatDomain } from "@/utils/formatter";
import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";

/**
 * A shared folder's link preview (Slack, X, iMessage…): the folder's emoji,
 * name, owner and link count on the left, the Purl mark at the bottom, and
 * its most recent links on the right as the grid view's cards (thumbnail,
 * favicon, title, domain) in a two-column masonry that runs off the edge,
 * so the folder reads as continuing. An empty folder gets the left side
 * only. Private, missing and renamed folders get no image (404), like the
 * page. Remote images are fetched through `safeFetch` and inlined
 * (`src/lib/og-images.ts`); the renderer never contacts other sites.
 */

export const alt = "A shared folder on Purl";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Cards drawn: three per column, newest first, left to right. */
const CARD_COUNT = 6;
const COLUMNS = 2;
/**
 * Cached briefly: a folder made private stops showing its preview within
 * minutes, even from a CDN.
 */
const CACHE_CONTROL = "public, max-age=300, s-maxage=300";

// Layout: the folder in a 500px column on the left (72px padding around
// it), then two 236px card columns from x = 668, 36px from the right edge.
const PADDING = 72;
const LEFT_WIDTH = 500;
const CARD_WIDTH = 236;
const GUTTER = 24;
/** The second column starts lower, so the cards don't line up in rows. */
const COLUMN_OFFSETS = [44, 132];

// The app's palette (dark), as plain values for the renderer.
const BACKGROUND = "#0a0a0a";
const CARD = "#171717";
const TINT = "#1f1f1f";
const FOREGROUND = "#fafafa";
const MUTED = "#a1a1a1";
const HAIRLINE = "rgba(255, 255, 255, 0.1)";

/**
 * lucide's Globe in the muted color: what the app shows for a link whose
 * favicon can't be drawn.
 */
const GLOBE_SVG = `data:image/svg+xml;base64,${Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${MUTED}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>`,
).toString("base64")}`;

/** Purl's mark (public/logo.svg): a pearl. */
const LOGO_SVG = `data:image/svg+xml;base64,${Buffer.from(
  '<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="url(#p)"/><defs><radialGradient id="p" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(6) scale(28.5 26.4348)"><stop offset="0.457935" stop-color="white"/><stop offset="1" stop-color="#EAE0C8"/></radialGradient></defs></svg>',
).toString("base64")}`;

/** Inter, like the app; loaded once per server. Falls back to the default. */
let interFonts: Promise<
  { name: string; data: ArrayBuffer; weight: 400 | 600; style: "normal" }[]
> | null = null;
function loadInter() {
  interFonts ??= Promise.all(
    ([400, 600] as const).map(async (weight) => {
      const response = await fetch(
        `https://cdn.jsdelivr.net/npm/@fontsource/inter@5/files/inter-latin-${weight}-normal.woff`,
      );
      if (!response.ok) throw new Error(`Inter ${weight}: ${response.status}`);
      return {
        name: "Inter",
        data: await response.arrayBuffer(),
        weight,
        style: "normal" as const,
      };
    }),
  ).catch(() => {
    interFonts = null; // try again next time
    return [];
  });
  return interFonts;
}

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

type CardData = {
  link: PublicLink;
  thumbnail: string | null;
  favicon: string | null;
};

/**
 * One grid-view card (`SharedLinkCard`), drawn at 236px: the thumbnail at
 * 16:10 (or the favicon on a tint when there's none), then the favicon,
 * the title (two lines at most) and the domain.
 */
function LinkCard({ link, thumbnail, favicon }: CardData) {
  const mediaHeight = Math.round((CARD_WIDTH * 10) / 16);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: CARD_WIDTH,
        borderRadius: 12,
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
          height: mediaHeight,
          background: TINT,
        }}
      >
        {thumbnail ? (
           
          <img
            src={thumbnail}
            width={CARD_WIDTH}
            height={mediaHeight}
            alt=""
            style={{ objectFit: "cover" }}
          />
        ) : (
          // No thumbnail: the favicon on the tint, like the grid's fallback.
           
          <img src={favicon ?? GLOBE_SVG} width={48} height={48} alt="" />
        )}
      </div>
      <div style={{ display: "flex", gap: 10, padding: "14px 16px 16px" }}>
        <div style={{ display: "flex", width: 16, height: 22, alignItems: "center" }}>
          { }
          <img src={favicon ?? GLOBE_SVG} width={16} height={16} alt="" />
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            width: CARD_WIDTH - 32 - 26,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 16,
              fontWeight: 600,
              lineHeight: 1.35,
              color: FOREGROUND,
              maxHeight: 44,
              overflow: "hidden",
            }}
          >
            {truncate(link.title, 52)}
          </div>
          <div style={{ display: "flex", fontSize: 15, color: MUTED }}>
            {truncate(formatDomain(link.domain), 26)}
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function Image({
  params,
}: {
  params: Promise<{ username: string; slug: string }>;
}) {
  const { username, slug } = await params;
  const resolved = await resolvePublicFolder(username, slug);
  if (!resolved || resolved.kind !== "folder") notFound();
  const { owner, folder, ids } = resolved;

  const [{ links }, linkCount, avatar, fonts] = await Promise.all([
    listPublicFolderLinks(ids, { limit: CARD_COUNT }),
    countPublicFolderLinks(ids),
    fetchImageAsDataUrl(owner.image),
    loadInter(),
  ]);
  const cards: CardData[] = await Promise.all(
    links.map(async (link) => {
      const [thumbnail, favicon] = await Promise.all([
        link.contentType === "PDF" ? null : fetchImageAsDataUrl(link.thumbnail),
        fetchImageAsDataUrl(link.favicon),
      ]);
      return { link, thumbnail, favicon };
    }),
  );
  // Masonry like the grid: newest first, left to right.
  const columns = Array.from({ length: COLUMNS }, (_, column) =>
    cards.filter((_, index) => index % COLUMNS === column),
  );
  const withCards = cards.length > 0;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: BACKGROUND,
          color: FOREGROUND,
          fontFamily: "Inter",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: withCards ? LEFT_WIDTH + PADDING * 2 : "100%",
            height: "100%",
            padding: PADDING,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", fontSize: 88, lineHeight: 1 }}>
              {folder.emoji}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 64,
                fontWeight: 600,
                lineHeight: 1.1,
                letterSpacing: "-0.02em",
              }}
            >
              {truncate(folder.name, withCards ? 40 : 60)}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                fontSize: 30,
                color: MUTED,
              }}
            >
              by
              {avatar ? (
                 
                <img
                  src={avatar}
                  width={36}
                  height={36}
                  alt=""
                  style={{ borderRadius: 18 }}
                />
              ) : null}
              <span style={{ color: FOREGROUND }}>
                @{truncate(owner.username, 28)}
              </span>
            </div>
            <div style={{ display: "flex", fontSize: 26, color: MUTED }}>
              {linkCount === 1 ? "1 link" : `${linkCount} links`}
            </div>
          </div>
          <div
            style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 30 }}
          >
            { }
            <img src={LOGO_SVG} width={40} height={40} alt="" />
            Purl
          </div>
        </div>
        {withCards ? (
          <div style={{ display: "flex", gap: GUTTER, paddingLeft: GUTTER }}>
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
                  <LinkCard key={card.link.id} {...card} />
                ))}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    ),
    {
      ...size,
      fonts: fonts.length ? fonts : undefined,
      headers: { "Cache-Control": CACHE_CONTROL },
    },
  );
}
