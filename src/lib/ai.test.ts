import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGateway = vi.fn();
const mockGatewayEmbedding = vi.fn();
const mockOpenAiTranscription = vi.fn();

vi.mock("@ai-sdk/gateway", () => ({
  gateway: Object.assign(mockGateway, {
    embedding: mockGatewayEmbedding,
  }),
}));

vi.mock("@ai-sdk/openai", () => ({
  openai: {
    transcription: mockOpenAiTranscription,
  },
}));

const {
  EMBEDDING_MODEL,
  TRANSCRIPTION_MODEL,
  getEmbeddingModel,
  getTranscriptionModel,
} = await import("./ai");

describe("ai model helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGateway.mockReturnValue({ provider: "gateway-chat" });
    mockGatewayEmbedding.mockReturnValue({ provider: "gateway-embed" });
    mockOpenAiTranscription.mockReturnValue({ provider: "openai-transcribe" });
  });

  it("routes embeddings through the gateway", () => {
    const model = getEmbeddingModel();
    expect(mockGatewayEmbedding).toHaveBeenCalledWith(EMBEDDING_MODEL);
    expect(model).toEqual({ provider: "gateway-embed" });
  });

  it("routes transcription through OpenAI", () => {
    const model = getTranscriptionModel();
    expect(mockOpenAiTranscription).toHaveBeenCalledWith(TRANSCRIPTION_MODEL);
    expect(model).toEqual({ provider: "openai-transcribe" });
  });
});
