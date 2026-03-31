"use client";

import {
  UPLOAD_ERROR_EVENT,
  UPLOAD_START_EVENT,
  UPLOAD_SUCCESS_EVENT,
} from "@/utils/upload-events";

export const UPLOAD_FILE_INPUT_ACCEPT = ".pdf,audio/*";

export async function getAudioDurationInSeconds(
  file: File,
): Promise<number | null> {
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

type UploadFileAsLinkOptions = {
  emitEvents?: boolean;
};

type UploadResponseBody = {
  id?: string;
  error?: string;
};

export async function uploadFileAsLink(
  file: File,
  options?: UploadFileAsLinkOptions,
): Promise<{ id?: string }> {
  const emitEvents = options?.emitEvents ?? true;

  if (emitEvents) {
    window.dispatchEvent(
      new CustomEvent(UPLOAD_START_EVENT, {
        detail: { label: file.name },
      }),
    );
  }

  try {
    const formData = new FormData();
    const audioDuration = await getAudioDurationInSeconds(file);
    formData.append("file", file);
    if (audioDuration !== null) {
      formData.append("durationSeconds", String(audioDuration));
    }

    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    const body = (await response.json().catch(() => null)) as UploadResponseBody | null;
    if (!response.ok) {
      throw new Error(body?.error ?? "Upload failed");
    }

    if (emitEvents) {
      window.dispatchEvent(
        new CustomEvent(UPLOAD_SUCCESS_EVENT, {
          detail: { id: body?.id },
        }),
      );
    }

    return { id: body?.id };
  } catch (error) {
    if (emitEvents) {
      window.dispatchEvent(new CustomEvent(UPLOAD_ERROR_EVENT));
    }
    throw error;
  }
}
