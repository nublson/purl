import { mediaViewer } from "@/lib/media-viewer";

/**
 * The open pearl lives in the URL as `?pearl=<id>`, so a reload, a shared
 * link and the browser's Back button all work. Pure helpers plus a small
 * class over `history`, so they test without a browser; the React binding is
 * in `media-viewer-url-hook.ts`.
 */
export const PEARL_PARAM = "pearl";

export type HistoryLike = {
  pushState(url: string): void;
  replaceState(url: string): void;
  back(): void;
};

const BASE = "http://purl.invalid";

/** The pearl id in a search string (`?pearl=abc`), or null. */
export function pearlParam(search: string): string | null {
  return new URLSearchParams(search).get(PEARL_PARAM) || null;
}

function rebuild(href: string, edit: (params: URLSearchParams) => void) {
  const url = new URL(href, BASE);
  edit(url.searchParams);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** `href` with `?pearl=<id>` set; every other param is kept. */
export function withPearl(href: string, id: string): string {
  return rebuild(href, (params) => params.set(PEARL_PARAM, id));
}

/** `href` without `pearl`; every other param is kept, `?` dropped when empty. */
export function withoutPearl(href: string): string {
  return rebuild(href, (params) => params.delete(PEARL_PARAM));
}

function pearlIn(href: string) {
  return pearlParam(new URL(href, BASE).search);
}

export class ViewerUrl {
  /** The pearl in the entry this instance pushed, null when it pushed none. */
  private pushedId: string | null = null;
  private handlingPop = false;

  constructor(
    private readonly history: HistoryLike,
    private readonly getHref: () => string,
  ) {}

  /** A pearl opened: push an entry, unless the URL already names it. */
  open(id: string) {
    const href = this.getHref();
    if (pearlIn(href) === id) return;
    this.history.pushState(withPearl(href, id));
    this.pushedId = id;
  }

  /** Next/previous: swap the param in place, no new entry. */
  navigate(id: string) {
    this.history.replaceState(withPearl(this.getHref(), id));
    if (this.pushedId !== null) this.pushedId = id;
  }

  /**
   * The viewer closed. Go back when this instance pushed the entry and the
   * page is still on it; otherwise (opened from the URL, or the page moved
   * on) just strip the param.
   */
  close() {
    const pushedId = this.pushedId;
    this.pushedId = null;
    if (this.handlingPop) return;
    const href = this.getHref();
    if (pushedId !== null && pearlIn(href) === pushedId) {
      this.history.back();
      return;
    }
    if (pearlIn(href) !== null) this.history.replaceState(withoutPearl(href));
  }

  /**
   * The browser moved through history. A URL without the param closes the
   * viewer; that close must not go back again.
   */
  onPopState(search: string) {
    this.pushedId = null;
    if (pearlParam(search) !== null) return;
    this.handlingPop = true;
    try {
      mediaViewer.close();
    } finally {
      this.handlingPop = false;
    }
  }
}
