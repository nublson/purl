import { HomeChatWidget } from "@/components/chat/home-chat-widget";
import { HomeShellLoader } from "./home-shell-loader";

export async function ApiKeyLoader() {
  return (
    <>
      <HomeShellLoader />
      <div className="fixed bottom-4 right-4 md:bottom-8 md:right-8">
        <HomeChatWidget />
      </div>
    </>
  );
}
