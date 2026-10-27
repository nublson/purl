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

/** Largest single file an upload accepts. */
export const MAX_UPLOAD_FILE_BYTES = 25 * 1024 * 1024;

/**
 * Largest preview image an upload's token allows. A 1,280 px WebP preview is
 * well under this; previews don't count against storage, so the cap keeps a
 * preview from carrying a file.
 */
export const MAX_UPLOAD_PREVIEW_BYTES = 2 * 1024 * 1024;

/** Per-account storage for uploaded files (the sum of `Link.fileSize`). */
export const MAX_UPLOAD_BYTES_PER_ACCOUNT = 250 * 1024 * 1024;

/** Most files the client uploads at once; the rest wait their turn. */
export const MAX_CONCURRENT_UPLOADS = 3;

/**
 * Longest a blob may wait for its row: `createUploadForUser` refuses a file
 * (or preview) uploaded longer ago, so a late request can't adopt a blob the
 * sweep may be deleting.
 */
export const UPLOAD_ROW_WINDOW_MS = 30 * 60 * 1000;

/**
 * The sweep leaves blobs younger than this alone: twice the row window, so a
 * row can never be created for a blob the sweep has already judged orphaned.
 */
export const SWEEP_MIN_AGE_MS = 2 * UPLOAD_ROW_WINDOW_MS;
