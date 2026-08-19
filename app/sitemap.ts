import type { MetadataRoute } from "next";
import { getCanonicalUrl, getSiteUrl } from "@/lib/site-url";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = await getSiteUrl();

  return [
    {
      url: getCanonicalUrl(siteUrl).href,
      lastModified: new Date("2026-08-12T00:00:00+08:00"),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
