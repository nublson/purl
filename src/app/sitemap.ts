import type { MetadataRoute } from "next";
import { STATIC_PAGES } from "@/lib/static-pages";

const baseUrl = process.env.BASE_URL as string;

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: baseUrl, changeFrequency: "monthly", priority: 1 },
    ...STATIC_PAGES.map(({ path }) => ({
      url: `${baseUrl}${path}`,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
