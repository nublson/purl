import * as Sentry from "@sentry/nextjs";

export type IngestContentType = "WEB" | "YOUTUBE" | "PDF" | "AUDIO";

export function logIngestStart(
  contentType: IngestContentType,
  linkId: string,
  url: string,
): void {
  console.log(
    JSON.stringify({
      event: "ingest_started",
      contentType,
      linkId,
      url,
    }),
  );
}

export function logIngestFailure(
  contentType: IngestContentType,
  linkId: string,
  url: string,
  error: unknown,
): void {
  console.error(
    JSON.stringify({
      event: "ingest_failed",
      contentType,
      linkId,
      url,
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : String(error),
    }),
  );

  Sentry.captureException(error, {
    tags: { contentType },
    extra: { linkId, url },
  });
}
