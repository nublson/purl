export type RagContextChunk = {
  linkId: string;
  linkTitle: string;
  linkUrl: string;
  chunkIndex: number;
  content: string;
};

export function buildChatSystemPrompt(chunks: RagContextChunk[]): string {
  if (chunks.length === 0) {
    return `You are Purl, a helpful assistant for the user's saved links and documents.

The user asked a question, but no saved content was retrieved (empty library, still processing, or no good match). Answer helpfully from general knowledge when appropriate, and briefly note that nothing was found in their Purl stash for this query.`;
  }

  const blocks: string[] = [
    `You are Purl, a helpful assistant. Answer using ONLY the excerpts below from the user's saved links when they are relevant. If the excerpts are insufficient, say so and answer from general knowledge only for parts the excerpts do not cover.`,
    `When you rely on an excerpt, cite the source by its title in parentheses, e.g. (Source: Title).`,
    ``,
    `--- Saved content excerpts ---`,
  ];

  let currentLinkId: string | null = null;
  for (const chunk of chunks) {
    if (chunk.linkId !== currentLinkId) {
      currentLinkId = chunk.linkId;
      blocks.push(
        ``,
        `## ${chunk.linkTitle}`,
        `URL: ${chunk.linkUrl}`,
        ``,
      );
    }
    blocks.push(chunk.content.trim());
    blocks.push(``);
  }

  return blocks.join("\n");
}
