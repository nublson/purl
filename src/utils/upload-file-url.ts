/**
 * Uploaded files live in a private bucket, so their `Link.url` is this stable,
 * authenticated app route rather than an expiring storage signed URL. The route
 * re-signs on every request (see `src/app/api/links/[id]/file/route.ts`).
 */
export function uploadFilePath(linkId: string): string {
  return `/api/links/${encodeURIComponent(linkId)}/file`;
}

const UPLOAD_FILE_PATH_RE = /^\/api\/links\/[^/?#]+\/file$/;

export function isUploadFilePath(url: string): boolean {
  return UPLOAD_FILE_PATH_RE.test(url);
}
