"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  formatChatHistoryTime,
  groupChatsByChatHistoryDate,
} from "@/utils/formatter";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Typography } from "../typography";

export interface ChatHistoryItem {
  id: string;
  title: string | null;
  updatedAt: string;
}

interface ChatHistoryProps {
  chats: ChatHistoryItem[];
  isLoading: boolean;
  onSelectChat: (id: string) => void;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

export function ChatHistory({
  chats,
  isLoading,
  onSelectChat,
  onOpenChange,
  children,
}: ChatHistoryProps) {
  const [open, setOpen] = useState(false);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };

  const groups = groupChatsByChatHistoryDate(chats);

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent className="w-2xs max-h-52" align="start">
        {isLoading && (
          <div className="px-2 py-3 text-center">
            <Typography size="small" className="text-muted-foreground">
              Loading…
            </Typography>
          </div>
        )}
        {!isLoading && chats.length === 0 && (
          <div className="px-2 py-3 text-center">
            <Typography size="small" className="text-muted-foreground">
              No past chats
            </Typography>
          </div>
        )}
        {!isLoading &&
          groups.map((group, groupIndex) => (
            <DropdownMenuGroup key={group.label}>
              {groupIndex > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
              {group.chats.map((chat) => (
                <DropdownMenuItem
                  key={chat.id}
                  className="flex items-center justify-between"
                  onSelect={() => {
                    onSelectChat(chat.id);
                    setOpen(false);
                  }}
                >
                  <Typography
                    size="small"
                    className="text-accent-foreground line-clamp-1 break-all"
                  >
                    {chat.title?.trim() || "New chat"}
                  </Typography>
                  <Typography
                    size="small"
                    className="text-muted-foreground shrink-0 ml-2"
                  >
                    {formatChatHistoryTime(chat.updatedAt)}
                  </Typography>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
