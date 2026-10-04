import { firstDrawableImages, fetchImageAsDataUrl } from "@/lib/og-images";
import {
  countPublicFolderLinks,
  listPublicFolderLinks,
  resolvePublicFolder,
} from "@/lib/public-folders";
import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";

/**
 * A shared folder's link preview (Slack, X, iMessage…): the folder's emoji,
 * name, owner and link count on the left, its three most recent thumbnails
 * fanned on the right (just the folder card when none load), the Purl mark
 * at the bottom. Private, missing and renamed folders get no image (404),
 * like the page. Remote images are fetched through `safeFetch` and inlined
 * (`src/lib/og-images.ts`); the renderer never contacts other sites.
 */

export const alt = "A shared folder on Purl";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Thumbnails in the collage. */
const COLLAGE_SIZE = 3;
/** Recent links tried for those thumbnails (some won't load or draw). */
const THUMBNAIL_CANDIDATES = 8;
/**
 * Cached briefly: a folder made private stops showing its preview within
 * minutes, even from a CDN.
 */
const CACHE_CONTROL = "public, max-age=300, s-maxage=300";

// The app's palette (dark), as plain values for the renderer.
const BACKGROUND = "#0a0a0a";
const CARD = "#171717";
const FOREGROUND = "#fafafa";
const MUTED = "#a1a1a1";
const HAIRLINE = "rgba(255, 255, 255, 0.1)";

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
    listPublicFolderLinks(ids, { limit: THUMBNAIL_CANDIDATES }),
    countPublicFolderLinks(ids),
    fetchImageAsDataUrl(owner.image),
    loadInter(),
  ]);
  const thumbnails = await firstDrawableImages(
    links.map((link) => link.thumbnail),
    COLLAGE_SIZE,
  );
  const collage = thumbnails.length > 0;

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
          padding: 72,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: collage ? 560 : "100%",
            height: "100%",
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
              {truncate(folder.name, collage ? 40 : 60)}
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
        {collage ? (
          // Fanned: the newest on top, slightly turned; older ones behind.
          <div style={{ display: "flex", position: "relative", flex: 1 }}>
            {thumbnails
              .map((src, index) => ({ src, index }))
              .reverse()
              .map(({ src, index }) => (
                <div
                  key={index}
                  style={{
                    display: "flex",
                    position: "absolute",
                    width: 400,
                    height: 250,
                    top: 60 + index * 70,
                    left: 40 + index * 40,
                    transform: `rotate(${[-4, 3, -2][index]}deg)`,
                    borderRadius: 16,
                    overflow: "hidden",
                    background: CARD,
                    border: `1px solid ${HAIRLINE}`,
                    boxShadow: "0 24px 48px rgba(0, 0, 0, 0.5)",
                  }}
                >
                  { }
                  <img
                    src={src}
                    width={400}
                    height={250}
                    alt=""
                    style={{ objectFit: "cover" }}
                  />
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
