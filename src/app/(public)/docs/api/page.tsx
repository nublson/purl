import { StaticPage, staticPageMetadata } from "@/components/static-page";

// Static, refreshed hourly and whenever Notion's webhook expires the cache.
export const dynamic = "force-static";
export const revalidate = 3600;

export function generateMetadata() {
  return staticPageMetadata("api");
}

export default function Page() {
  return <StaticPage slug="api" />;
}
