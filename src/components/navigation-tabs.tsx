"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { UserPreferences } from "@/lib/user-preferences";
import { fetchPreferences } from "@/lib/user-preferences-client";
import { House, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

export function NavigationTabs() {
  const pathname = usePathname();
  const [defaultPage, setDefaultPage] =
    React.useState<NonNullable<UserPreferences["defaultPage"]>>("home");

  React.useEffect(() => {
    fetchPreferences()
      .then((data) => setDefaultPage(data.defaultPage ?? "home"))
      .catch(() => {});
  }, []);

  const activeTab = pathname.startsWith("/ai")
    ? "ai"
    : pathname.startsWith("/home")
      ? "home"
      : defaultPage;

  return (
    <Tabs className="fixed top-3.5 z-51" value={activeTab}>
      <TabsList className="bg-muted/60">
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
            AI
          </Link>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
