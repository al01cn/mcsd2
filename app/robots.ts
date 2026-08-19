import type { MetadataRoute } from "next";
import { getCanonicalUrl, getSiteUrl } from "@/lib/site-url";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const siteUrl = await getSiteUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: "/api/",
    },
    sitemap: getCanonicalUrl(siteUrl, "/sitemap.xml").href,
    host: siteUrl.origin,
  };
}
