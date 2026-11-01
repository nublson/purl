/**
 * Pure Markdown rendering for the MCP resources that expose folders (and
 * "All links") to clients. No runtime import of anything server-only.
 */
import { formatFolderLabel, formatLinkCount } from "@/lib/folder-display";
import type { FolderSummary } from "@/lib/folders";
import type { ResourceLink } from "@/lib/links";

export const ALL_LINKS_URI = "purl://links";
export const FOLDER_URI_TEMPLATE = "purl://folders/{folderId}";
export const ALL_LINKS_NAME = "🏠 All links";
/** MCP "resource not found" JSON-RPC error code. */
export const RESOURCE_NOT_FOUND = -32002;

const DESCRIPTION_MAX = 200;

export function folderResourceUri(id: string): string {
  return `purl://folders/${id}`;
}

export function folderResourceDescription(folder: FolderSummary): string {
  const count = formatLinkCount(folder.linkCount);
  return folder.description ? `${folder.description} · ${count}` : count;
}

export function allLinksDescription(count: number): string {
  return `Every link you've saved, newest first (${formatLinkCount(count)})`;
}

const TYPE_LABELS: Record<string, string> = {
  PDF: "PDF",
  YOUTUBE: "YouTube",
  AUDIO: "Audio",
};

function escapeTitle(title: string): string {
  return title
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\\/g, "\\\\")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

function renderLinks(links: ResourceLink[], { withFolder }: { withFolder: boolean }): string {
  const lines: string[] = [];
  let currentDay: string | null = null;
  for (const link of links) {
    const day = link.createdAt.toISOString().slice(0, 10);
    if (day !== currentDay) {
      if (currentDay !== null) lines.push("");
      lines.push(`## ${day}`, "");
      currentDay = day;
    }
    const title = escapeTitle(link.title ?? "") || escapeTitle(link.url);
    const target = /[()\s]/.test(link.url) ? `<${link.url}>` : link.url;
    let line = `- [${title}](${target})`;
    const domain = link.domain?.trim();
    if (domain) line += ` · ${domain}`;
    const label = TYPE_LABELS[link.contentType];
    if (label) line += ` · ${label}`;
    if (withFolder && link.folder) line += ` · ${formatFolderLabel(link.folder)}`;
    lines.push(line);
    const description = link.description?.replace(/\s+/g, " ").trim();
    if (description) {
      const chars = Array.from(description);
      const cut =
        chars.length > DESCRIPTION_MAX
          ? `${chars.slice(0, DESCRIPTION_MAX).join("")}…`
          : description;
      lines.push(`  ${cut}`);
    }
  }
  return lines.join("\n");
}

function snapshotFooter(now: Date, folderId?: string): string {
  const iso = now.toISOString();
  const stamp = `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
  const hint = folderId ? `list_saved_items with folderId ${folderId}` : "list_saved_items";
  return `_Snapshot from ${stamp}. For the latest links, use ${hint}._`;
}

export function renderFolderResource(
  folder: FolderSummary,
  links: ResourceLink[],
  now: Date,
): string {
  const parts = [`# ${formatFolderLabel(folder)}`];
  const description = folder.description?.replace(/\s+/g, " ").trim();
  if (description) parts.push(description);
  if (links.length === 0) {
    parts.push("No links in this folder yet.");
  } else {
    parts.push(`${formatLinkCount(links.length)}, newest first.`);
    parts.push(renderLinks(links, { withFolder: false }));
  }
  parts.push(snapshotFooter(now, folder.id));
  return `${parts.join("\n\n")}\n`;
}

export function renderAllLinksResource(links: ResourceLink[], now: Date): string {
  const parts = [`# ${ALL_LINKS_NAME}`];
  if (links.length === 0) {
    parts.push("No links saved yet.");
  } else {
    parts.push(`${formatLinkCount(links.length)}, newest first.`);
    parts.push(renderLinks(links, { withFolder: true }));
  }
  parts.push(snapshotFooter(now));
  return `${parts.join("\n\n")}\n`;
}
