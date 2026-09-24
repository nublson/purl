/** Max profile avatar image size (bytes). */
export const AVATAR_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export function avatarMaxSizeExceededMessage(): string {
  const mb = AVATAR_MAX_UPLOAD_BYTES / (1024 * 1024);
  return `Profile photos must be under ${mb} MB`;
}
