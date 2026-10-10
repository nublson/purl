export type NotionRenderContext = {
  pageSlug: string;
  pageIdToPath: ReadonlyMap<string, string>;
  /** One slugger per page, so heading ids stay unique across nested blocks. */
  slug: (text: string) => string;
};
