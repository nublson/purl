import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";

export const CHAT_MODEL = "claude-sonnet-4-6";
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const TRANSCRIPTION_MODEL = "whisper-1";

export function getChatModel() {
  return anthropic(CHAT_MODEL);
}

export function getEmbeddingModel() {
  return openai.embedding(EMBEDDING_MODEL);
}

export function getTranscriptionModel() {
  return openai.transcription(TRANSCRIPTION_MODEL);
}
