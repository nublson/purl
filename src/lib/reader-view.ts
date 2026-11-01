import { linkKind } from "@/lib/link-kind";
import type { Link, ReaderViewState } from "@/utils/links";

/** Whether a link can have a reader view at all: a saved web page. */
export function qualifiesForReader(
  link: Pick<Link, "contentType" | "upload">,
): boolean {
  return link.contentType === "WEB" && !link.upload;
}

/** Whether a row or card opens the ready reader view instead of the page. */
export function linkOpensReader(link: Link): boolean {
  return (
    qualifiesForReader(link) &&
    linkKind(link) === "page" &&
    link.readerView?.status === "READY"
  );
}

export function readerViewPath(id: string): string {
  return `/read/${id}`;
}

/** The reader view's state in words: short for the menu, long for the page. */
export function readerStateMessage(
  state: ReaderViewState | null,
  opts?: { short?: boolean },
): string {
  const short = opts?.short ?? false;
  if (!state || state.status === "PENDING") {
    return short
      ? "Making the reader view…"
      : "Purl is making the reader view. It takes a minute or two.";
  }
  if (state.status === "READY") {
    if (!state.fetchedAt) return "Reader view ready";
    const day = new Date(state.fetchedAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
    return `Reader view ready · from ${day}`;
  }
  if (state.status === "NONE") {
    return state.reason === "not_html"
      ? "This page isn't a web page."
      : "No article to read on this page.";
  }
  switch (state.reason) {
    case "timeout":
      return "Couldn't make a reader view: it took too long.";
    case "too_large":
      return "Couldn't make a reader view: the page is too large.";
    default:
      return "Couldn't make a reader view: the page didn't answer.";
  }
}
