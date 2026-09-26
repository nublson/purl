"use client";

import { Loader2, Pencil, Upload } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "./ui/item";

interface UserItemProps {
  user: {
    name: string;
    email: string;
    image?: string;
  };
  /** Shows a spinner over the avatar while a new photo uploads. */
  isUploading?: boolean;
}

/**
 * Account header in the user menu. Display only: the enclosing menu item
 * opens the photo picker, so this must not contain its own button.
 */
export function UserItem({ user, isUploading = false }: UserItemProps) {
  const hasImage = Boolean(user.image);

  return (
    <Item size="xs" className="w-full p-2">
      <ItemMedia className="group-has-data-[slot=item-description]/item:self-center">
        <span className="relative rounded-full">
          <Avatar className="size-7">
            <AvatarImage src={user.image ?? ""} alt="" />
            <AvatarFallback>
              {isUploading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : hasImage ? (
                user.name?.charAt(0)
              ) : (
                <Upload className="size-3.5" />
              )}
            </AvatarFallback>
          </Avatar>
          {!isUploading ? (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-muted/40 opacity-0 transition-opacity group-hover/dropdown-menu-item:opacity-100 group-focus/dropdown-menu-item:opacity-100">
              <Pencil className="size-3" />
            </span>
          ) : null}
          {isUploading && hasImage ? (
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70">
              <Loader2 className="size-3.5 animate-spin" />
            </span>
          ) : null}
        </span>
      </ItemMedia>
      <ItemContent className="gap-0">
        <ItemTitle>{user?.name}</ItemTitle>
        <ItemDescription
          className="line-clamp-1 wrap-anywhere"
          title={user?.email}
        >
          {user?.email}
        </ItemDescription>
      </ItemContent>
    </Item>
  );
}
