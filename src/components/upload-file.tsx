"use client";

import {
  UPLOAD_FILE_INPUT_ACCEPT,
  uploadFileAsLink,
} from "@/lib/upload-file-client";
import { CloudUpload, Loader2 } from "lucide-react";
import type { ChangeEvent } from "react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "./ui/button";

export function UploadFile() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0];
    event.target.value = "";
    if (!selectedFile) return;

    setIsUploading(true);
    try {
      await uploadFileAsLink(selectedFile);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={UPLOAD_FILE_INPUT_ACCEPT}
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
        {isUploading ? <Loader2 className="animate-spin" /> : <CloudUpload />}
      </Button>
    </>
  );
}
