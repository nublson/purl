"use client";

import { useAuth } from "@/hooks/use-auth";
import { useAvatarUpload } from "@/hooks/use-avatar-upload";
import { useCurrentUser } from "@/hooks/use-current-user";
import { House, LogOut, MessageCircleHeart, SettingsIcon } from "lucide-react";
import Link from "next/link";
import { FeedbackDialog } from "./dialog-feedback";
import { SettingsDialog } from "./dialog-settings";
import { DropdownWrapper } from "./dropdown-wrapper";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "./ui/dropdown-menu";
import { UserItem } from "./user-item";

export function User() {
  const { user } = useCurrentUser();
  const { signOut } = useAuth();
  const { inputRef, isUploading, onFileChange, openPicker } = useAvatarUpload();

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFileChange}
      />
      <DropdownWrapper
        className="w-52"
        align="end"
        trigger={
          <Button
            data-cy="user-menu-button"
            aria-label="Account menu"
            variant="ghost"
            size="icon-sm"
            className="rounded-full"
          >
            <Avatar>
              <AvatarImage
                className="rounded-full"
                src={user?.image ?? ""}
                alt=""
              />
              <AvatarFallback>{user?.name?.charAt(0)}</AvatarFallback>
            </Avatar>
          </Button>
        }
      >
        <DropdownMenuGroup>
          <DropdownMenuItem
            aria-label={`${user?.name ?? ""}, ${user?.email ?? ""}. Change profile photo`}
            disabled={isUploading}
            onSelect={(event) => {
              event.preventDefault();
              openPicker();
            }}
          >
            <UserItem
              isUploading={isUploading}
              user={{
                image: user?.image ?? "",
                name: user?.name ?? "",
                email: user?.email ?? "",
              }}
            />
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <FeedbackDialog>
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
              }}
            >
              <MessageCircleHeart />
              Share feedback
            </DropdownMenuItem>
          </FeedbackDialog>
          <SettingsDialog>
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
              }}
            >
              <SettingsIcon />
              Settings
            </DropdownMenuItem>
          </SettingsDialog>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem data-cy="sign-out-menu-item" asChild>
          <Link href="/">
            <House />
            Home page
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          data-cy="sign-out-menu-item"
          onClick={() => signOut()}
        >
          <LogOut />
          Log out
        </DropdownMenuItem>
      </DropdownWrapper>
    </>
  );
}
