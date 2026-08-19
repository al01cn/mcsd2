import { headers } from "next/headers";

const DEFAULT_SITE_URL = "http://localhost:3000";

function firstHeaderValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim() || null;
}

function normalizeConfiguredUrl(value: string | undefined) {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

function normalizeRequestOrigin(requestHeaders: Headers) {
  const forwardedHost = firstHeaderValue(requestHeaders.get("x-forwarded-host"));
  const host = forwardedHost ?? firstHeaderValue(requestHeaders.get("host"));
  if (!host || /[\s/\\]/.test(host)) return null;

  const forwardedProtocol = firstHeaderValue(requestHeaders.get("x-forwarded-proto"));
  const protocol = forwardedProtocol === "http" || forwardedProtocol === "https"
    ? forwardedProtocol
    : host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http"
      : "https";

  try {
    return new URL(`${protocol}://${host}`);
  } catch {
    return null;
  }
}

export async function getSiteUrl() {
  const configuredUrl = normalizeConfiguredUrl(
    process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL,
  );
  if (configuredUrl) return configuredUrl;

  return normalizeRequestOrigin(await headers()) ?? new URL(DEFAULT_SITE_URL);
}

export function getCanonicalUrl(siteUrl: URL, pathname = "/") {
  return new URL(pathname, siteUrl);
}
