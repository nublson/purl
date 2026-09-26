/** Per-account cap on saved links. Guards against runaway scripts and abuse via the API/MCP. */
export const MAX_SAVED_LINKS = 1000;

/** Links rendered on the first /home load and fetched per infinite-scroll page. */
export const HOME_LINKS_PAGE_SIZE = 30;

/** Max results returned by the header search. */
export const LINK_SEARCH_LIMIT = 20;
