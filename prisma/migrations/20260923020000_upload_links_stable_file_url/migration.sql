-- Uploaded files were saved with a Supabase signed URL that expires after one
-- hour. Point every upload at the stable, authenticated app route instead;
-- GET /api/links/{id}/file re-signs on each request. Link ids are cuids, so
-- they need no URL encoding.
UPDATE "links"
SET "url" = '/api/links/' || "id" || '/file'
WHERE "storagePath" IS NOT NULL;
