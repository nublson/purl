import {
  publicFolderFeedPath,
  publicFolderPath,
  publicFolderTitle,
} from "@/lib/public-folder-path";
import type {
  PublicFolder,
  PublicLink,
  PublicOwner,
} from "@/lib/public-folders";

// Anything outside XML 1.0's Char production (lone surrogates included: with
// the `u` flag they are code points outside this set).
const FORBIDDEN_XML_CHARS =
  /[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu;

/** Drops characters XML 1.0 forbids, then escapes `& < > " '`. */
export function escapeXml(text: string): string {
  return text
    .replace(FORBIDDEN_XML_CHARS, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function absolute(path: string, origin: string): string {
  return new URL(path, origin).toString();
}

/** An Atom 1.0 feed of a public folder's links, newest first. */
export function buildAtomFeed(input: {
  origin: string;
  owner: PublicOwner;
  folder: PublicFolder;
  links: PublicLink[];
  now?: Date;
}): string {
  const { origin, owner, folder, links, now = new Date() } = input;
  const pageUrl = absolute(publicFolderPath(owner.username, folder.slug), origin);
  const feedUrl = absolute(
    publicFolderFeedPath(owner.username, folder.slug),
    origin,
  );
  const updated = (links[0]?.createdAt ?? now).toISOString();

  const entries = links.map((link) => {
    const created = link.createdAt.toISOString();
    return [
      "  <entry>",
      `    <id>tag:purl.live,2026:link:${escapeXml(link.id)}</id>`,
      `    <title>${escapeXml(link.title).trim() || escapeXml(link.url)}</title>`,
      `    <link rel="alternate" href="${escapeXml(link.url)}"/>`,
      `    <published>${created}</published>`,
      `    <updated>${created}</updated>`,
      ...(link.description !== null
        ? [`    <summary type="text">${escapeXml(link.description)}</summary>`]
        : []),
      "  </entry>",
    ].join("\n");
  });

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    `  <title>${escapeXml(publicFolderTitle(folder.emoji, folder.name, owner.username))}</title>`,
    ...(folder.description !== null
      ? [`  <subtitle>${escapeXml(folder.description)}</subtitle>`]
      : []),
    `  <id>${escapeXml(pageUrl)}</id>`,
    `  <link rel="self" type="application/atom+xml" href="${escapeXml(feedUrl)}"/>`,
    `  <link rel="alternate" type="text/html" href="${escapeXml(pageUrl)}"/>`,
    `  <updated>${updated}</updated>`,
    `  <author><name>${escapeXml(owner.name)}</name></author>`,
    ...entries,
    "</feed>",
    "",
  ].join("\n");
}
