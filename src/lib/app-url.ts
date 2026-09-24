import "server-only";

export function getAppBaseUrl(): string {
  const fromAuth = process.env.BETTER_AUTH_URL?.trim();
  if (fromAuth) return fromAuth.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "")}`;
  return "http://localhost:3000";
}
