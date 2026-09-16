import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateAnthropic = vi.fn();
const mockAnthropicModel = vi.fn();
const mockGateway = vi.fn();
const mockGatewayEmbedding = vi.fn();
const mockOpenAiTranscription = vi.fn();

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: mockCreateAnthropic,
}));

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
  CHAT_MODEL,
  DIRECT_CHAT_MODEL,
  EMBEDDING_MODEL,
  TRANSCRIPTION_MODEL,
  getChatModel,
  getChatModelForUser,
  getEmbeddingModel,
  getTranscriptionModel,
} = await import("./ai");

describe("ai model helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateAnthropic.mockReturnValue(mockAnthropicModel);
    mockGateway.mockReturnValue({ provider: "gateway-chat" });
    mockGatewayEmbedding.mockReturnValue({ provider: "gateway-embed" });
    mockAnthropicModel.mockReturnValue({ provider: "anthropic-direct" });
    mockOpenAiTranscription.mockReturnValue({ provider: "openai-transcribe" });
  });

  it("routes chat through the gateway by default", () => {
    const model = getChatModel();
    expect(mockGateway).toHaveBeenCalledWith(CHAT_MODEL);
    expect(model).toEqual({ provider: "gateway-chat" });
  });

  it("routes chat through the user's Anthropic key when provided", () => {
    const model = getChatModelForUser("sk-ant-user-key");
    expect(mockCreateAnthropic).toHaveBeenCalledWith({
      apiKey: "sk-ant-user-key",
    });
    expect(mockAnthropicModel).toHaveBeenCalledWith(DIRECT_CHAT_MODEL);
    expect(model).toEqual({ provider: "anthropic-direct" });
    expect(mockGateway).not.toHaveBeenCalled();
  });

  it("falls back to the gateway when userAnthropicKey is nullish", () => {
    expect(getChatModelForUser(null)).toEqual({ provider: "gateway-chat" });
    expect(getChatModelForUser(undefined)).toEqual({ provider: "gateway-chat" });
    expect(mockGateway).toHaveBeenCalledWith(CHAT_MODEL);
    expect(mockCreateAnthropic).not.toHaveBeenCalled();
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
