import { createAnthropic } from "@ai-sdk/anthropic";
import { gateway } from "@ai-sdk/gateway";
import { openai } from "@ai-sdk/openai";

export const CHAT_MODEL = "anthropic/claude-sonnet-4.6";
export const DIRECT_CHAT_MODEL = "claude-sonnet-4-6";
export const EMBEDDING_MODEL = "openai/text-embedding-3-small";
export const TRANSCRIPTION_MODEL = "whisper-1";

export function getChatModel() {
  return gateway(CHAT_MODEL);
}

export function getChatModelForUser(userAnthropicKey?: string | null) {
  if (userAnthropicKey) {
    return createAnthropic({ apiKey: userAnthropicKey })(DIRECT_CHAT_MODEL);
  }
  return getChatModel();
}

export function getEmbeddingModel() {
  return gateway.embedding(EMBEDDING_MODEL);
}

export function getTranscriptionModel() {
  return openai.transcription(TRANSCRIPTION_MODEL);
}
