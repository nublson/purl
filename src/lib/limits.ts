/** Per-account cap on saved links. Guards against runaway scripts and abuse via the API/MCP. */
export const MAX_SAVED_LINKS = 1000;

/** Links rendered on the first /home load and fetched per infinite-scroll page. */
export const HOME_LINKS_PAGE_SIZE = 30;

/** Per-account cap on folders. */
export const MAX_FOLDERS = 100;

/** Most link ids one bulk move/delete accepts: every link an account can hold. */
export const MAX_BULK_LINK_IDS = MAX_SAVED_LINKS;

/** Most links one multi-link paste saves; more asks to paste fewer. */
export const MAX_PASTED_URLS = 50;

/** Most links one import request carries; the client sends a file in chunks of this size. */
export const MAX_IMPORT_CHUNK = 200;

/** Largest bookmarks/CSV file the import reads. */
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

/** Longest folder name, in UTF-16 units (`String#length`). */
export const MAX_FOLDER_NAME_LENGTH = 60;
