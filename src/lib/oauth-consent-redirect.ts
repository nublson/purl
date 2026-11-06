/** Validates the consent endpoint response before redirecting the browser. */
export function requireConsentRedirectUri(data: { url?: string }): string {
  if (!data.url) {
    throw new Error("No redirect URL returned");
  }
  return data.url;
}
