"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { House, Sparkles } from "lucide-react";
import Link from "next/link";

export function NavigationTabs() {
  return (
    <Tabs className="fixed top-4 z-51" defaultValue="home">
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
