import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/home", "/api/"],
      },
    ],
    sitemap: "https://getpurl.vercel.app/sitemap.xml",
  };
}
