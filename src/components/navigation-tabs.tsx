"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePreferences } from "@/hooks/use-preferences";
import { House, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavigationTabs() {
  const pathname = usePathname();
  const { preferences } = usePreferences();
  const defaultPage = preferences.defaultPage ?? "home";

  const activeTab = pathname.startsWith("/ai")
    ? "ai"
    : pathname.startsWith("/home")
      ? "home"
      : defaultPage;

  return (
    <Tabs className="fixed top-3.5 z-51" value={activeTab}>
      <TabsList className="bg-accent/40">
        <TabsTrigger
          value="home"
          asChild
          className="border-none data-active:bg-background!"
        >
          <Link href="/home">
            <House />
            Home
          </Link>
        </TabsTrigger>
        <TabsTrigger
          value="ai"
          asChild
          className="border-none data-active:bg-background!"
        >
          <Link href="/ai">
            <Sparkles />
            Purl AI
          </Link>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
