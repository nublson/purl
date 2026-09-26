"use client";

import { useCurrentUser } from "@/hooks/use-current-user";
import { updateUser } from "@/lib/auth-client";
import {
  AVATAR_MAX_UPLOAD_BYTES,
  avatarMaxSizeExceededMessage,
} from "@/utils/upload-limits";
import type { ChangeEvent } from "react";
import { useRef, useState } from "react";
import { toast } from "sonner";

type AvatarUploadResponse = {
  image?: string;
  error?: string;
};

/**
 * Profile photo upload shared by the account menu and Settings → Account.
 * Render a hidden `<input type="file">` with `inputRef` and `onFileChange`,
 * then call `openPicker` from a button.
 */
export function useAvatarUpload() {
  const { setUser } = useCurrentUser();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
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
        throw new Error(body?.error ?? "Unable to upload the photo. Try again.");
      }
      if (!body?.image) {
        throw new Error("Unable to upload the photo. Try again.");
      }

      const updateResult = await updateUser({ image: body.image });
      if (updateResult.error) {
        throw new Error(
          updateResult.error.message ?? "Unable to update your profile. Try again.",
        );
      }
      const image = body.image;
      setUser((current) => (current ? { ...current, image } : current));
      toast.success("Profile photo updated");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Unable to upload the photo. Try again.");
    } finally {
      setIsUploading(false);
    }
  }

  return {
    inputRef,
    isUploading,
    onFileChange,
    openPicker: () => inputRef.current?.click(),
  };
}
