import { openai } from "@ai-sdk/openai";

export const CHAT_MODEL = "gpt-5.4-nano";
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const TRANSCRIPTION_MODEL = "whisper-1";

export function getChatModel() {
  return openai(CHAT_MODEL);
}

export function getEmbeddingModel() {
  return openai.embedding(EMBEDDING_MODEL);
}

export function getTranscriptionModel() {
  return openai.transcription(TRANSCRIPTION_MODEL);
}
