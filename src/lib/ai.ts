import { openai } from "@ai-sdk/openai";

export const CHAT_MODEL = "gpt-4o-mini";
export const EMBEDDING_MODEL = "text-embedding-3-small";

export function getChatModel() {
  return openai(CHAT_MODEL);
}

export function getEmbeddingModel() {
  return openai.embedding(EMBEDDING_MODEL);
}
