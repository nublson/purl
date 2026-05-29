"use client";

import { updateUser } from "@/lib/auth-client";
import {
  AVATAR_MAX_UPLOAD_BYTES,
  avatarMaxSizeExceededMessage,
} from "@/utils/upload-limits";
import { Loader2, Pencil, Upload } from "lucide-react";
import type { ChangeEvent } from "react";
import { useRef, useState } from "react";
import { toast } from "sonner";
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
}

type AvatarUploadResponse = {
  image?: string;
  error?: string;
};

export function UserItem({ user }: UserItemProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const hasImage = Boolean(user.image);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0];
    event.target.value = "";
    if (!selectedFile) return;

    if (selectedFile.size > AVATAR_MAX_UPLOAD_BYTES) {
      toast.error(avatarMaxSizeExceededMessage());
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch("/api/user/avatar", {
        method: "POST",
        body: formData,
      });

      const body = (await response
        .json()
        .catch(() => null)) as AvatarUploadResponse | null;
      if (!response.ok) {
        throw new Error(body?.error ?? "Upload failed");
      }
      if (!body?.image) {
        throw new Error("Upload failed");
      }

      const updateResult = await updateUser({ image: body.image });
      if (updateResult.error) {
        throw new Error(
          updateResult.error.message ?? "Failed to update profile",
        );
      }
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <Item size="xs" className="w-full p-2">
      <ItemMedia className="group-has-data-[slot=item-description]/item:self-center">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          type="button"
          aria-label="Upload profile photo"
          disabled={isUploading}
          className="group relative cursor-pointer rounded-full disabled:cursor-not-allowed"
          onClick={(event) => {
            event.stopPropagation();
            event.preventDefault();
            inputRef.current?.click();
          }}
        >
          <Avatar className="size-7">
            <AvatarImage src={user.image ?? ""} />
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
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-muted/40 opacity-0 transition-opacity group-hover:opacity-100">
              <Pencil className="size-3" />
            </span>
          ) : null}
          {isUploading && hasImage ? (
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70">
              <Loader2 className="size-3.5 animate-spin" />
            </span>
          ) : null}
        </button>
      </ItemMedia>
      <ItemContent className="gap-0">
        <ItemTitle>{user?.name}</ItemTitle>
        <ItemDescription className="leading-none">
          {user?.email}
        </ItemDescription>
      </ItemContent>
    </Item>
  );
}
