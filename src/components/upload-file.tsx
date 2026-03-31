"use client";

import { Loader2, Plus } from "lucide-react";
import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  UPLOAD_ERROR_EVENT,
  UPLOAD_START_EVENT,
  UPLOAD_SUCCESS_EVENT,
} from "@/utils/upload-events";
import { Button } from "./ui/button";

async function getAudioDurationInSeconds(file: File): Promise<number | null> {
  if (!file.type.startsWith("audio/")) return null;

  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : null;
      URL.revokeObjectURL(url);
      resolve(duration);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    audio.src = url;
  });
}

export function UploadFile() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0];
    event.target.value = "";
    if (!selectedFile) return;

    window.dispatchEvent(
      new CustomEvent(UPLOAD_START_EVENT, {
        detail: { label: selectedFile.name },
      }),
    );
    setIsUploading(true);
    try {
      const formData = new FormData();
      const audioDuration = await getAudioDurationInSeconds(selectedFile);
      formData.append("file", selectedFile);
      if (audioDuration !== null) {
        formData.append("durationSeconds", String(audioDuration));
      }
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(errorBody?.error ?? "Upload failed");
      }
      const body = (await response.json().catch(() => null)) as
        | { id?: string }
        | null;
      window.dispatchEvent(
        new CustomEvent(UPLOAD_SUCCESS_EVENT, {
          detail: { id: body?.id },
        }),
      );
    } catch (error) {
      window.dispatchEvent(new CustomEvent(UPLOAD_ERROR_EVENT));
      console.error(error);
      alert(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,audio/*"
        className="hidden"
        onChange={handleFileChange}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="cursor-pointer text-muted-foreground"
        disabled={isUploading}
        onClick={() => inputRef.current?.click()}
      >
        {isUploading ? (
          <Loader2 className="animate-spin" />
        ) : (
          <Plus />
        )}
      </Button>
    </>
  );
}
