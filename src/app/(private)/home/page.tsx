import { HomeChatWidget } from "@/components/chat/home-chat-widget";
import { ApiKeyProvider } from "@/contexts/api-key-context";
import { ChatProvider } from "@/contexts/chat-context";
import { getApiKeyStatus } from "@/lib/api-keys";
import { Suspense } from "react";
import { HomeLinksFallback } from "./home-links-fallback";
import { HomeShellLoader } from "./home-shell-loader";

export default async function Home() {
  const { hasKey } = await getApiKeyStatus();

  return (
    <ApiKeyProvider hasApiKey={hasKey}>
      <ChatProvider>
        <div className="wrapper-private flex flex-1 flex-col gap-8 pt-24 pb-32">
          <Suspense fallback={<HomeLinksFallback />}>
            <HomeShellLoader />
          </Suspense>
          <div className="fixed bottom-4 right-4 md:bottom-8 md:right-8">
            <HomeChatWidget />
          </div>
        </div>
      </ChatProvider>
    </ApiKeyProvider>
  );
}
