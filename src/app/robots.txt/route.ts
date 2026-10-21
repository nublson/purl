import { buildRobotsTxt } from "@/lib/robots-txt";

// A route handler rather than `robots.ts`: Next's robots metadata has no way
// to write the Content-Signal line.
export function GET() {
  return new Response(buildRobotsTxt(process.env.BASE_URL as string), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
