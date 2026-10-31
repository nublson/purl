/**
 * The bookmarks export: a Netscape bookmarks file (what browsers export and
 * Raindrop, browsers and Purl's own Import read) built from plain rows, so
 * `GET /api/links/export` only has to fetch them. The format carries a
 * folder's name and a link's URL, title, date and description, nothing
 * else: folder emoji and descriptions, upload sizes and content types stay
 * out. Uploads appear by their file URL like any link.
 */

export type ExportFolder = {
  id: string;
  name: string;
  createdAt: Date;
};

export type ExportLink = {
  url: string;
  title: string;
  description: string | null;
  folderId: string | null;
  createdAt: Date;
};

const HEAD = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>`;

/** Safe inside both attribute values (double-quoted) and text. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** One line: the format has no block text, and the importer flattens whitespace anyway. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

const addDate = (date: Date) => Math.floor(date.getTime() / 1000);

function linkLine(link: ExportLink, indent: string): string {
  const anchor = `${indent}<DT><A HREF="${escapeHtml(link.url)}" ADD_DATE="${addDate(link.createdAt)}">${escapeHtml(oneLine(link.title))}</A>`;
  const description = link.description ? oneLine(link.description) : "";
  return description ? `${anchor}\n${indent}<DD>${escapeHtml(description)}` : anchor;
}

const newestFirst = (a: ExportLink, b: ExportLink) =>
  b.createdAt.getTime() - a.createdAt.getTime();

/**
 * Folders in the order given (the user's), each with its links newest first;
 * links in no folder (or in one that isn't listed) at the top level, which
 * Purl's importer reads as Home.
 */
export function buildBookmarksHtml({
  folders,
  links,
}: {
  folders: ExportFolder[];
  links: ExportLink[];
}): string {
  const byFolder = new Map<string, ExportLink[]>(folders.map((f) => [f.id, []]));
  const unfiled: ExportLink[] = [];
  for (const link of links) {
    const bucket = link.folderId === null ? undefined : byFolder.get(link.folderId);
    (bucket ?? unfiled).push(link);
  }

  const lines: string[] = [HEAD, "<DL><p>"];
  for (const folder of folders) {
    lines.push(
      `    <DT><H3 ADD_DATE="${addDate(folder.createdAt)}">${escapeHtml(oneLine(folder.name))}</H3>`,
      "    <DL><p>",
    );
    for (const link of (byFolder.get(folder.id) ?? []).sort(newestFirst)) {
      lines.push(linkLine(link, "        "));
    }
    lines.push("    </DL><p>");
  }
  for (const link of unfiled.sort(newestFirst)) {
    lines.push(linkLine(link, "    "));
  }
  lines.push("</DL><p>", "");
  return lines.join("\n");
}

/** `purl-bookmarks-YYYY-MM-DD.html`, the date in UTC. */
export function exportFileName(now: Date = new Date()): string {
  return `purl-bookmarks-${now.toISOString().slice(0, 10)}.html`;
}
