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

/**
 * The pearl whose entry the viewer pushed, null when it pushed none. Module
 * level, beside the store: a remount while the viewer is open (a new
 * `ViewerUrl`) must still go `back()` on close instead of leaving a duplicate
 * entry behind.
 */
let pushedEntryId: string | null = null;

/** Forgets the pushed entry (for tests; the app never needs it). */
export function forgetPushedEntry() {
  pushedEntryId = null;
}

type ViewerStore = Pick<
  typeof mediaViewer,
  "subscribe" | "getSnapshot" | "open" | "close" | "requestClose"
>;

export class ViewerUrl {
  private handlingPop = false;

  constructor(
    private readonly history: HistoryLike,
    private readonly getHref: () => string,
    private readonly store: ViewerStore = mediaViewer,
  ) {}

  /** A pearl opened: push an entry, unless the URL already names it. */
  open(id: string) {
    const href = this.getHref();
    if (pearlIn(href) === id) return;
    this.history.pushState(withPearl(href, id));
    pushedEntryId = id;
  }

  /** Next/previous: swap the param in place, no new entry. */
  navigate(id: string) {
    this.history.replaceState(withPearl(this.getHref(), id));
    if (pushedEntryId !== null) pushedEntryId = id;
  }

  /**
   * The viewer closed. Go back when this app pushed the entry and the page is
   * still on it; otherwise (opened from the URL, or the page moved on) just
   * strip the param.
   */
  close() {
    const pushedId = pushedEntryId;
    pushedEntryId = null;
    if (this.handlingPop) return;
    if (pushedId !== null && pearlIn(this.getHref()) === pushedId) {
      this.history.back();
      return;
    }
    this.strip();
  }

  /** Removes the param from the current entry (replace), if it's there. */
  strip() {
    pushedEntryId = null;
    const href = this.getHref();
    if (pearlIn(href) !== null) this.history.replaceState(withoutPearl(href));
  }

  /**
   * The browser moved through history. A URL without the param, or naming a
   * different pearl than the one showing, closes the viewer; that close must
   * not go back again. (A hash-only move that still names the pushed pearl
   * keeps the push record.) Back off the viewer closes it as Esc does
   * (`requestClose`: it morphs into the card of the pearl shown, a few
   * frames later; by then no entry is pushed and the URL has no param, so
   * that close leaves the URL alone). A move onto another pearl's entry
   * closes at once, so that pearl opens in its place.
   */
  onPopState(search: string) {
    const popped = pearlParam(search);
    if (popped !== pushedEntryId) pushedEntryId = null;
    const { currentId } = this.store.getSnapshot();
    if (currentId === null || currentId === popped) return;
    this.handlingPop = true;
    try {
      if (popped === null) this.store.requestClose();
      else this.store.close();
    } finally {
      this.handlingPop = false;
    }
  }
}

export type ViewerUrlBinder = {
  /** Mirrors the store's latest change into the URL (and satisfies a request). */
  sync(): void;
  /** The browser moved through history. */
  onPopState(): void;
  /** Asks to show a pearl from the URL once the page has registered it. */
  request(id: string | null): void;
  /**
   * Gives up on the pending pearl (e.g. its fetch failed) and clears the URL.
   * With an id, only while that pearl is the one pending.
   */
  dismissPending(id?: string): void;
  /** The pearl the URL names while it isn't registered yet, else null. */
  pendingId(): string | null;
  dispose(): void;
};

/**
 * Binds the store to the URL: store changes become `open` / `navigate` /
 * `close` on `viewerUrl`, a pearl named by the URL opens once registered, and
 * history moves reopen or close the viewer. Pure over its inputs, so it tests
 * with a fake history; `useMediaViewerUrl` is a thin hook over it.
 */
export function bindViewerUrl(
  store: ViewerStore,
  viewerUrl: ViewerUrl,
  getSearch: () => string,
  onPendingChange?: (id: string | null) => void,
): ViewerUrlBinder {
  let previous: string | null = null;
  let requested: string | null = null;

  const setRequested = (id: string | null) => {
    if (requested === id) return;
    requested = id;
    onPendingChange?.(id);
  };

  // Opens the requested pearl as soon as the page has registered it.
  const satisfy = () => {
    if (requested === null) return;
    const { items, currentId } = store.getSnapshot();
    if (currentId !== null) {
      // Something is showing; a stale request must not reopen later.
      setRequested(null);
      return;
    }
    if (!items.some((item) => item.id === requested)) return;
    const id = requested;
    setRequested(null);
    store.open(id);
  };

  const sync = () => {
    const { currentId, pageLeft } = store.getSnapshot();
    if (currentId !== previous) {
      const before = previous;
      previous = currentId;
      if (currentId === null) {
        if (pageLeft) {
          // The page is unmounting (or StrictMode is simulating that), not
          // the viewer closing: leave the URL alone, and keep the pearl it
          // names pending, so a page that registers it again shows it.
          if (pearlParam(getSearch()) === before) setRequested(before);
        } else {
          viewerUrl.close();
        }
      } else if (before === null) viewerUrl.open(currentId);
      else viewerUrl.navigate(currentId);
    }
    satisfy();
  };

  const request = (id: string | null) => {
    setRequested(id);
    satisfy();
  };

  const unsubscribe = store.subscribe(sync);
  request(pearlParam(getSearch()));
  sync();

  return {
    sync,
    request,
    onPopState() {
      const search = getSearch();
      viewerUrl.onPopState(search);
      // Back/Forward onto a pearl entry (re)opens it, or leaves it pending.
      if (store.getSnapshot().currentId === null) request(pearlParam(search));
      else sync();
    },
    dismissPending(id?: string) {
      if (requested === null || (id !== undefined && requested !== id)) return;
      setRequested(null);
      viewerUrl.strip();
    },
    pendingId: () => requested,
    dispose: unsubscribe,
  };
}
