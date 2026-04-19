import { HomeChatWidget } from "@/components/chat/home-chat-widget";
import { ApiKeyProvider } from "@/contexts/api-key-context";
import { getApiKeyStatus } from "@/lib/api-keys";
import { HomeShellLoader } from "./home-shell-loader";

export async function ApiKeyLoader() {
  const { hasKey } = await getApiKeyStatus();

  return (
    <ApiKeyProvider hasApiKey={hasKey}>
      <HomeShellLoader />
      <div className="fixed bottom-4 right-4 md:bottom-8 md:right-8">
        <HomeChatWidget />
      </div>
    </ApiKeyProvider>
  );
}
