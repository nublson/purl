"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import { useEffect, useState } from "react";

interface SidebarItem {
  id: string;
  label: string;
  children?: { id: string; label: string }[];
}

interface DocsSidebarProps {
  items: SidebarItem[];
}

export function DocsSidebar({ items }: DocsSidebarProps) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-10% 0px -80% 0px" },
    );

    items.forEach(({ id, children }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
      children?.forEach(({ id: childId }) => {
        const childEl = document.getElementById(childId);
        if (childEl) observer.observe(childEl);
      });
    });

    return () => observer.disconnect();
  }, [items]);

  return (
    <nav className="sticky top-24 flex flex-col gap-1">
      {items.map((item) => (
        <div key={item.id}>
          <Link
            href={`#${item.id}`}
            className={cn(
              "block rounded-md px-3 py-1.5 text-sm transition-colors hover:text-foreground",
              activeId === item.id
                ? "font-medium text-foreground"
                : "text-muted-foreground",
            )}
          >
            {item.label}
          </Link>
          {item.children?.map((child) => (
            <Link
              key={child.id}
              href={`#${child.id}`}
              className={cn(
                "block rounded-md py-1 pl-6 pr-3 text-sm transition-colors hover:text-foreground",
                activeId === child.id
                  ? "font-medium text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {child.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
