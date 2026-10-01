/** Per-account cap on saved links. Guards against runaway scripts and abuse via the API/MCP. */
export const MAX_SAVED_LINKS = 1000;

/** Links rendered on the first /home load and fetched per infinite-scroll page. */
export const HOME_LINKS_PAGE_SIZE = 30;

/** Per-account cap on folders. */
export const MAX_FOLDERS = 100;
