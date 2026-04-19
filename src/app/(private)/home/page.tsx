import { ChatProvider } from "@/contexts/chat-context";
import { Suspense } from "react";
import { ApiKeyLoader } from "./api-key-loader";
import { HomeLinksFallback } from "./home-links-fallback";

export default function Home() {
  return (
    <ChatProvider>
      <div className="wrapper-private flex flex-1 flex-col gap-8 pt-24 pb-32">
        <Suspense fallback={<HomeLinksFallback />}>
          <ApiKeyLoader />
        </Suspense>
      </div>
    </ChatProvider>
  );
}
