import { getCanonicalUrl, getSiteUrl } from "@/lib/site-url";

export async function GET() {
  const siteUrl = await getSiteUrl();
  const body = `${getCanonicalUrl(siteUrl).href}\n`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
