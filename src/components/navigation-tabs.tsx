"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { House, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavigationTabs() {
  const pathname = usePathname();
  const activeTab = pathname.startsWith("/ai") ? "ai" : "home";

  return (
    <Tabs className="fixed bottom-4" value={activeTab}>
      <TabsList>
        <TabsTrigger value="home" asChild>
          <Link href="/home">
            <House />
            Home
          </Link>
        </TabsTrigger>
        <TabsTrigger value="ai" asChild>
          <Link href="/ai">
            <Sparkles />
            AI
          </Link>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
