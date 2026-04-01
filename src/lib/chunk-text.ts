const DEFAULT_CHUNK_SIZE = 1500;
const DEFAULT_CHUNK_OVERLAP = 150;

export function chunkText(
  text: string,
  options?: { chunkSize?: number; chunkOverlap?: number },
): string[] {
  const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const chunkOverlap = options?.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP;

  if (chunkSize <= 0) return [];
  if (chunkOverlap >= chunkSize) {
    throw new Error("chunkOverlap must be smaller than chunkSize.");
  }

  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < normalized.length) {
    const targetEnd = Math.min(cursor + chunkSize, normalized.length);
    if (targetEnd === normalized.length) {
      chunks.push(normalized.slice(cursor).trim());
      break;
    }

    // Keep chunks word-aligned by preferring to break at whitespace.
    let splitAt = normalized.lastIndexOf(" ", targetEnd);
    if (splitAt <= cursor) splitAt = targetEnd;

    const chunk = normalized.slice(cursor, splitAt).trim();
    if (chunk) chunks.push(chunk);

    cursor = Math.max(splitAt - chunkOverlap, cursor + 1);
  }

  return chunks;
}
