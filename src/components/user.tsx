"use client";

import { useAuth } from "@/hooks/use-auth";
import { useCurrentUser } from "@/hooks/use-current-user";
import { House, LogOut, MessageCircleHeart, SettingsIcon } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import {
  SettingsDeepLink,
  SettingsDialog,
  type SettingsTabValue,
} from "./dialog-settings";
import { FeedbackDialog } from "./dialog-feedback";
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

  // Owned here, not inside SettingsDialog/its dropdown trigger: Radix only
  // mounts the dropdown's menu content once it's been opened, so a
  // ?settings= deep link arriving on page load needs SettingsDeepLink
  // mounted unconditionally, with the dialog it drives controlled from here.
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [settingsDefaultTab, setSettingsDefaultTab] = React.useState<
    SettingsTabValue | undefined
  >(undefined);

  return (
    <>
      <React.Suspense fallback={null}>
        <SettingsDeepLink
          onOpen={(tab) => {
            setSettingsDefaultTab(tab);
            setSettingsOpen(true);
          }}
        />
      </React.Suspense>
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
          <UserItem
            user={{
              image: user?.image ?? "",
              name: user?.name ?? "",
              email: user?.email ?? "",
            }}
          />
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
          <SettingsDialog
            open={settingsOpen}
            onOpenChange={(open) => {
              setSettingsOpen(open);
              // Reset so a later manual open lands on the first tab instead
              // of whatever a past deep link set.
              if (!open) setSettingsDefaultTab(undefined);
            }}
            defaultTab={settingsDefaultTab}
          >
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
