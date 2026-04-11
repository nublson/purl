import { HomeChatWidget } from "@/components/chat/home-chat-widget";
import { ChatProvider } from "@/contexts/chat-context";
import { HomeLinksFallback } from "./home-links-fallback";
import { HomeShellLoader } from "./home-shell-loader";
import { Suspense } from "react";

export default function Home() {
  return (
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
  );
}
