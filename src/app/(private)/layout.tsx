import { ChatProvider } from "@/contexts/chat-context";
import { PreferencesProvider } from "@/contexts/preferences-context";
import { auth } from "@/lib/auth";
import { DEFAULT_PREFERENCES, getPreferences } from "@/lib/user-preferences";
import type { Metadata } from "next";
import { headers } from "next/headers";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function PrivateLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  const initialPreferences = userId
    ? await getPreferences(userId)
    : DEFAULT_PREFERENCES;

  return (
    <ChatProvider>
      <PreferencesProvider initialPreferences={initialPreferences}>
        {children}
      </PreferencesProvider>
    </ChatProvider>
  );
}
