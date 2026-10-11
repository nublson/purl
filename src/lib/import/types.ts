/** One bookmark read from an import file. */
export type ImportItem = {
  url: string;
  title: string;
  folder: string | null;
  createdAt: Date | null;
};

export type ImportFormat = "bookmarks-html" | "raindrop-csv" | "pocket-csv";

/** An `ImportItem` as sent to the server (dates as ISO strings). */
export type ImportLinkInput = {
  url: string;
  title: string;
  folder: string | null;
  createdAt: string | null;
};

export type ImportLinksResult = {
  imported: number;
  duplicates: number;
  invalid: number;
  overLimit: number;
  foldersCreated: number;
  unfiledForFolderLimit: number;
  limitReached: boolean;
};
