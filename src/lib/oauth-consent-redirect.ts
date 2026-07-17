/** Validates the consent endpoint response before redirecting the browser. */
export function requireConsentRedirectUri(data: {
  redirectURI?: string;
}): string {
  if (!data.redirectURI) {
    throw new Error("No redirect URL returned");
  }
  return data.redirectURI;
}
