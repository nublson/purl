import type { ReactNode } from "react";
import { Typography } from "@/components/typography";
import { classifyNotionLink } from "@/lib/notion-links";
import type { NotionBlock } from "@/lib/notion";
import { STATIC_PAGES } from "@/lib/static-pages";
import { getYouTubeEmbedUrl } from "@/utils/youtube";
import { NotionAnchor, RichText } from "./rich-text";
import type { NotionRenderContext } from "./types";

type Props = { block: NotionBlock; context: NotionRenderContext };
type RichTextArray = Parameters<typeof RichText>[0]["text"];

const plain = (text: RichTextArray) => text.map((t) => t.plain_text).join("");

function Caption({
  caption,
  context,
}: {
  caption: RichTextArray;
  context: NotionRenderContext;
}) {
  if (caption.length === 0) return null;
  return (
    <figcaption className="mt-2 text-sm text-muted-foreground">
      <RichText text={caption} context={context} />
    </figcaption>
  );
}

function LinkLine({ children }: { children: ReactNode }) {
  return (
    <Typography className="max-w-[68ch] break-words text-foreground">
      {children}
    </Typography>
  );
}

export function ImageBlock({ block, context }: Props) {
  if (block.type !== "image") return null;
  const image = block.image;
  if (image.type !== "external") {
    console.warn(
      `Static page "${context.pageSlug}": skipped uploaded image ${block.id}; link images instead`,
    );
    return null;
  }
  return (
    <figure className="max-w-3xl">
      {/* eslint-disable-next-line @next/next/no-img-element -- remote, unknown dimensions */}
      <img
        src={image.external.url}
        alt={plain(image.caption)}
        loading="lazy"
        className="w-full rounded-lg border border-border"
      />
      <Caption caption={image.caption} context={context} />
    </figure>
  );
}

export function VideoBlock({ block, context }: Props) {
  if (block.type !== "video" || block.video.type !== "external") return null;
  const { url } = block.video.external;
  const caption = block.video.caption;
  const embed = getYouTubeEmbedUrl(url);
  if (embed) {
    return (
      <figure className="max-w-3xl">
        <iframe
          src={embed}
          title={plain(caption) || "YouTube video"}
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
          loading="lazy"
          className="aspect-video w-full rounded-lg"
        />
        <Caption caption={caption} context={context} />
      </figure>
    );
  }
  return <UrlLink url={url} caption={caption} context={context} />;
}

/** A line linking to a URL, labelled by the caption or the URL itself. */
function UrlLink({
  url,
  caption,
  context,
}: {
  url: string;
  caption: RichTextArray;
  context: NotionRenderContext;
}) {
  const link = classifyNotionLink(url, context.pageIdToPath);
  if (!link) return null;
  return (
    <LinkLine>
      <NotionAnchor link={link}>
        {caption.length > 0 ? plain(caption) : url}
      </NotionAnchor>
    </LinkLine>
  );
}

export function BookmarkBlock({ block, context }: Props) {
  if (block.type === "bookmark") {
    return (
      <UrlLink
        url={block.bookmark.url}
        caption={block.bookmark.caption}
        context={context}
      />
    );
  }
  if (block.type === "embed") {
    return (
      <UrlLink
        url={block.embed.url}
        caption={block.embed.caption}
        context={context}
      />
    );
  }
  if (block.type === "link_preview") {
    return <UrlLink url={block.link_preview.url} caption={[]} context={context} />;
  }
  return null;
}

export function LinkToPageBlock({ block, context }: Props) {
  if (block.type !== "link_to_page" || block.link_to_page.type !== "page_id") {
    return null;
  }
  const id = block.link_to_page.page_id.replace(/-/g, "").toLowerCase();
  const path = context.pageIdToPath.get(id);
  const page = STATIC_PAGES.find((p) => p.path === path);
  if (!path || !page) return null;
  return (
    <LinkLine>
      <NotionAnchor link={{ href: path, external: false }}>
        {page.label}
      </NotionAnchor>
    </LinkLine>
  );
}
