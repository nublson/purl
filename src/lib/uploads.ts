import "server-only";

/** Uploads need a Vercel Blob store; without its token they're hidden. */
export function uploadsEnabled(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}
