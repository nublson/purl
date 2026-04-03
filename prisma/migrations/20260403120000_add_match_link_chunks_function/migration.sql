-- CreateFunction
CREATE OR REPLACE FUNCTION match_link_chunks(
    query_embedding vector(1536),
    p_user_id TEXT,
    match_count INTEGER,
    p_content_type TEXT DEFAULT NULL
)
RETURNS TABLE(link_id TEXT, similarity DOUBLE PRECISION)
LANGUAGE sql
STABLE
AS $$
  SELECT
    lc."linkId" AS link_id,
    1 - MIN(lc.embedding <=> query_embedding) AS similarity
  FROM "link_contents" lc
  JOIN "links" l ON l."id" = lc."linkId"
  WHERE l."userId" = p_user_id
    AND lc.embedding IS NOT NULL
    AND (p_content_type IS NULL OR l."contentType"::TEXT = p_content_type)
  GROUP BY lc."linkId"
  ORDER BY similarity DESC
  LIMIT match_count;
$$;
