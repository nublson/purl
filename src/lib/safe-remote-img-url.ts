/** Allow only http(s) URLs for untrusted `<img src>` (blocks javascript:, data:, etc.). */
export function safeRemoteImgSrc(src: string): string | null {
  try {
    const u = new URL(src);
    if (u.protocol === "https:" || u.protocol === "http:") {
      return u.href;
    }
    return null;
  } catch {
    return null;
  }
}
