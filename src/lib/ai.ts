import { gateway } from "@ai-sdk/gateway";
import { openai } from "@ai-sdk/openai";

export const EMBEDDING_MODEL = "openai/text-embedding-3-small";
export const TRANSCRIPTION_MODEL = "whisper-1";

export function getEmbeddingModel() {
  return gateway.embedding(EMBEDDING_MODEL);
}

export function getTranscriptionModel() {
  return openai.transcription(TRANSCRIPTION_MODEL);
}
