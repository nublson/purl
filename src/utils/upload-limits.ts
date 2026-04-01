/** Max audio file size for uploads and URL-based transcription (bytes). */
export const AUDIO_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export function audioMaxSizeExceededMessage(): string {
  const mb = AUDIO_MAX_UPLOAD_BYTES / (1024 * 1024);
  return `Audio files must be under ${mb} MB`;
}
