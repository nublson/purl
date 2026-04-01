import { generateText, type ModelMessage } from "ai";
import { getChatModel } from "@/lib/ai";

export async function generateChatResponse(messages: ModelMessage[]) {
  return generateText({
    model: getChatModel(),
    messages,
  });
}
