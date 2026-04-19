import { createOpenAI, openai } from "@ai-sdk/openai";

export const CHAT_MODEL = "gpt-5.4-mini";
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const TRANSCRIPTION_MODEL = "whisper-1";

function getOpenAIClient(apiKey?: string) {
  if (apiKey) {
    return createOpenAI({ apiKey });
  }
  return openai;
}

export function getChatModel(apiKey?: string) {
  return getOpenAIClient(apiKey)(CHAT_MODEL);
}

export function getEmbeddingModel(apiKey?: string) {
  return getOpenAIClient(apiKey).embedding(EMBEDDING_MODEL);
}

export function getTranscriptionModel(apiKey?: string) {
  return getOpenAIClient(apiKey).transcription(TRANSCRIPTION_MODEL);
}
