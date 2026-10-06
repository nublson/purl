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
 * favicon, title, domain) in a two-column masonry that runs off the bottom,
 * so the folder reads as continuing. An empty folder gets the left side
 * only. Private and missing folders get no image (404), like the page; an
 * old name (after a rename) draws the current folder. Remote images are fetched through `safeFetch` and inlined
 * (`src/lib/og-images.ts`); the renderer never contacts other sites.
 */

export const contentType = "image/png";
const SIZE = { width: 1200, height: 630 };

/** Cards drawn: three per column, newest first, left to right. */
const CARD_COUNT = 6;
const COLUMNS = 2;
/**
 * Cached briefly: a folder made private stops showing its preview within
 * minutes, even from a CDN.
 */
const CACHE_CONTROL = "public, max-age=300, s-maxage=300";

// Layout: 72px margins all round. The folder in a 500px column on the
// left, then two 230px card columns (24px apart) ending 72px from the
// right edge. The first column's top lines up with the folder's emoji; the
// second starts lower, so the cards don't line up in rows.
const PADDING = 72;
const LEFT_WIDTH = 500;
const GUTTER = 24;
const CARD_WIDTH =
  (SIZE.width - (LEFT_WIDTH + PADDING * 2) - GUTTER - PADDING) / COLUMNS;
const COLUMN_OFFSETS = [PADDING, 160];

// The app's palette (dark), as plain values for the renderer.
const BACKGROUND = "#0a0a0a";
const CARD = "#171717";
const TINT = "#1f1f1f";
const FOREGROUND = "#fafafa";
const MUTED = "#a1a1a1";
const HAIRLINE = "rgba(255, 255, 255, 0.1)";

/**
 * Reicon's Globe in the muted color: what the app shows for a link whose
 * favicon can't be drawn.
 */
const GLOBE_SVG = `data:image/svg+xml;base64,${Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"><path fill-rule="evenodd" clip-rule="evenodd" d="M9.20646 3.18191C8.95433 3.26179 8.70533 3.35257 8.46018 3.45411C7.33792 3.91897 6.3182 4.60032 5.45926 5.45926C4.60032 6.3182 3.91897 7.33792 3.45411 8.46018C3.0852 9.35081 2.85837 10.2922 2.78045 11.25H7.26094C7.29294 10.1541 7.39498 9.0741 7.56457 8.05057C7.7725 6.79558 8.07972 5.63914 8.47522 4.65039C8.69114 4.11057 8.9351 3.61641 9.20646 3.18191ZM12 1.25C10.5883 1.25 9.1904 1.52806 7.88615 2.06829C6.5819 2.60853 5.39683 3.40037 4.3986 4.3986C3.40037 5.39683 2.60853 6.5819 2.0683 7.88615C1.52806 9.1904 1.25 10.5883 1.25 12C1.25 13.4117 1.52806 14.8096 2.06829 16.1138C2.60853 17.4181 3.40037 18.6032 4.3986 19.6014C5.39683 20.5996 6.5819 21.3915 7.88615 21.9317C9.1904 22.4719 10.5883 22.75 12 22.75C13.4117 22.75 14.8096 22.4719 16.1138 21.9317C17.4181 21.3915 18.6032 20.5996 19.6014 19.6014C20.5996 18.6032 21.3915 17.4181 21.9317 16.1138C22.4719 14.8096 22.75 13.4117 22.75 12C22.75 10.5883 22.4719 9.1904 21.9317 7.88615C21.3915 6.5819 20.5996 5.39683 19.6014 4.3986C18.6032 3.40037 17.4181 2.60853 16.1138 2.0683C14.8096 1.52806 13.4117 1.25 12 1.25ZM12 2.75C11.7387 2.75 11.4012 2.87579 11.0088 3.2822C10.6134 3.69161 10.2176 4.33326 9.86793 5.20747C9.52056 6.07589 9.2385 7.12424 9.04439 8.29576C8.88866 9.23569 8.79316 10.2331 8.76162 11.25L15.2384 11.25C15.2068 10.2331 15.1113 9.23569 14.9556 8.29576C14.7615 7.12424 14.4794 6.0759 14.1321 5.20748C13.7824 4.33326 13.3866 3.69161 12.9912 3.2822C12.5988 2.87579 12.2613 2.75 12 2.75ZM16.7391 11.25C16.7071 10.1541 16.605 9.07411 16.4354 8.05057C16.2275 6.79558 15.9203 5.63914 15.5248 4.65039C15.3089 4.11057 15.0649 3.61641 14.7935 3.18191C15.0457 3.26179 15.2947 3.35257 15.5398 3.45411C16.6621 3.91897 17.6818 4.60032 18.5407 5.45926C19.3997 6.31821 20.081 7.33792 20.5459 8.46018C20.9148 9.35082 21.1416 10.2922 21.2195 11.25H16.7391ZM15.2384 12.75L8.76162 12.75C8.79316 13.7669 8.88866 14.7643 9.04439 15.7042C9.2385 16.8758 9.52056 17.9241 9.86793 18.7925C10.2176 19.6667 10.6134 20.3084 11.0088 20.7178C11.4012 21.1242 11.7387 21.25 12 21.25C12.2613 21.25 12.5988 21.1242 12.9912 20.7178C13.3866 20.3084 13.7824 19.6667 14.1321 18.7925C14.4794 17.9241 14.7615 16.8758 14.9556 15.7042C15.1113 14.7643 15.2068 13.7669 15.2384 12.75ZM14.7935 20.8181C15.0649 20.3836 15.3089 19.8894 15.5248 19.3496C15.9203 18.3609 16.2275 17.2044 16.4354 15.9494C16.605 14.9259 16.7071 13.8459 16.7391 12.75H21.2195C21.1416 13.7078 20.9148 14.6492 20.5459 15.5398C20.081 16.6621 19.3997 17.6818 18.5407 18.5407C17.6818 19.3997 16.6621 20.081 15.5398 20.5459C15.2947 20.6474 15.0457 20.7382 14.7935 20.8181ZM9.20646 20.8181C8.9351 20.3836 8.69114 19.8894 8.47521 19.3496C8.07971 18.3609 7.7725 17.2044 7.56457 15.9494C7.39498 14.9259 7.29294 13.8459 7.26094 12.75H2.78045C2.85837 13.7078 3.0852 14.6492 3.45411 15.5398C3.91897 16.6621 4.60032 17.6818 5.45926 18.5407C6.3182 19.3997 7.33792 20.081 8.46018 20.5459C8.70533 20.6474 8.95433 20.7382 9.20646 20.8181Z" fill="${MUTED}"/></svg>`,
).toString("base64")}`;

/** Purl's mark (public/logo.svg): a pearl. */
const LOGO_SVG = `data:image/svg+xml;base64,${Buffer.from(
  '<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="url(#p)"/><defs><radialGradient id="p" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(6) scale(28.5 26.4348)"><stop offset="0.457935" stop-color="white"/><stop offset="1" stop-color="#EAE0C8"/></radialGradient></defs></svg>',
).toString("base64")}`;

type FontWeight = 400 | 500 | 600;
/** How long the font download may take before the preview goes without. */
const FONT_TIMEOUT_MS = 3000;

/**
 * Inter, like the app (400 text, 500 card titles as in `SharedLinkCard`,
 * 600 the folder name); loaded once per server. Falls back to the default.
 */
let interFonts: Promise<
  { name: string; data: ArrayBuffer; weight: FontWeight; style: "normal" }[]
> | null = null;
function loadInter() {
  interFonts ??= Promise.all(
    ([400, 500, 600] as const).map(async (weight) => {
      const response = await fetch(
        `https://cdn.jsdelivr.net/npm/@fontsource/inter@5/files/inter-latin-${weight}-normal.woff`,
        // A stalled CDN must not hold the preview: give up and use the
        // renderer's default font (retried on the next request).
        { signal: AbortSignal.timeout(FONT_TIMEOUT_MS) },
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

/**
 * The public folder an image URL points at, following a rename: an image
 * URL with an old username or slug (from a preview posted before the
 * rename, which some apps fetch again later) draws the folder as it is
 * now, instead of 404ing like before.
 */
async function resolveForImage(username: string, slug: string) {
  const resolved = await resolvePublicFolder(username, slug);
  if (resolved?.kind !== "redirect") return resolved;
  const current = await resolvePublicFolder(resolved.username, resolved.slug);
  return current?.kind === "folder" ? current : null;
}

function linkCountLabel(count: number) {
  if (count === 0) return "No links yet";
  return count === 1 ? "1 link" : `${count} links`;
}

/**
 * The image's alt text, per folder: what it shows, for people who can't
 * see it (X and Slack read it to screen readers).
 */
export async function generateImageMetadata({
  params,
}: {
  params:
    | { username: string; slug: string }
    | Promise<{ username: string; slug: string }>;
}) {
  // Plain for the page's metadata, a Promise when the image route itself
  // asks; awaiting covers both.
  const { username, slug } = (await params) ?? {};
  if (!username || !slug) return [];
  const resolved = await resolveForImage(username, slug);
  if (!resolved || resolved.kind !== "folder") return [];
  const count = await countPublicFolderLinks(resolved.ids);
  const links = count === 0 ? "no links yet" : linkCountLabel(count);
  return [
    {
      id: "preview",
      alt: `${resolved.folder.name}: ${links}, shared by @${resolved.owner.username} on Purl`,
      size: SIZE,
      contentType,
    },
  ];
}

type CardData = {
  link: PublicLink;
  thumbnail: string | null;
  favicon: string | null;
};

/**
 * One grid-view card (`SharedLinkCard`), drawn at 230px: the thumbnail at
 * 16:10 (or the favicon, else a globe, on a tint), then the favicon, the
 * title (two lines at most, with an ellipsis) and the domain.
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
        <div
          style={{ display: "flex", width: 16, height: 22, alignItems: "center" }}
        >
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
              display: "block",
              lineClamp: 2,
              fontSize: 16,
              fontWeight: 500,
              lineHeight: 1.35,
              color: FOREGROUND,
            }}
          >
            {link.title}
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
  const resolved = await resolveForImage(username, slug);
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
                display: "block",
                // Two lines at most. No textWrap balance: it balances the
                // whole name, then the clamp cuts it, leaving a short first
                // line and fewer words in view.
                lineClamp: 2,
                fontSize: 64,
                fontWeight: 600,
                lineHeight: 1.1,
                letterSpacing: "-0.02em",
              }}
            >
              {folder.name}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                fontSize: 34,
                color: MUTED,
              }}
            >
              by
              {avatar ? (
                <img
                  src={avatar}
                  width={40}
                  height={40}
                  alt=""
                  style={{ borderRadius: 20 }}
                />
              ) : null}
              <span style={{ color: FOREGROUND }}>
                @{truncate(owner.username, 26)}
              </span>
            </div>
            <div style={{ display: "flex", fontSize: 30, color: MUTED }}>
              {linkCountLabel(linkCount)}
            </div>
          </div>
          <div
            style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 30 }}
          >
            <img src={LOGO_SVG} width={40} height={40} alt="" />
            Purl
          </div>
        </div>
        {withCards ? (
          <div style={{ display: "flex", gap: GUTTER }}>
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
      ...SIZE,
      fonts: fonts.length ? fonts : undefined,
      headers: { "Cache-Control": CACHE_CONTROL },
    },
  );
}
