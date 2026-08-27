import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getCanonicalUrl, getSiteUrl } from "@/lib/site-url";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const TITLE = "MCSD2 - Minecraft 音频包生成器";
const DESCRIPTION =
  "MCSD2 是适配电脑和手机的 Minecraft 音频资源包生成器，可在浏览器内完成音频转换、声音事件设置与 Java 版、基岩版资源包导出。";

export async function generateMetadata(): Promise<Metadata> {
  const siteUrl = await getSiteUrl();
  const canonicalUrl = getCanonicalUrl(siteUrl);

  return {
    metadataBase: siteUrl,
    title: TITLE,
    description: DESCRIPTION,
    applicationName: "MCSD2",
    authors: [{ name: "al01cn", url: "https://github.com/al01cn" }],
    creator: "al01cn",
    publisher: "MCSD2",
    category: "technology",
    keywords: [
      "MCSD2",
      "Minecraft 音频包生成器",
      "Minecraft 音效包",
      "Minecraft 资源包",
      "Minecraft sound pack",
      "Minecraft resource pack",
      "音频转 OGG",
      "sounds.json",
    ],
    alternates: { canonical: canonicalUrl },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    openGraph: {
      type: "website",
      url: canonicalUrl,
      siteName: "MCSD2",
      locale: "zh_CN",
      alternateLocale: ["en_US"],
      title: TITLE,
      description: DESCRIPTION,
      images: [
        {
          url: "/opengraph-image",
          width: 1200,
          height: 630,
          alt: "MCSD2 Minecraft 音频包生成器",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      site: "@al01cn",
      creator: "@al01cn",
      title: TITLE,
      description: DESCRIPTION,
      images: [{ url: "/opengraph-image", alt: "MCSD2 Minecraft 音频包生成器" }],
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const siteUrl = await getSiteUrl();
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "MCSD2",
    alternateName: "Minecraft 音频包生成器 2.0",
    url: getCanonicalUrl(siteUrl).href,
    description: DESCRIPTION,
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Any",
    browserRequirements: "Requires a modern browser with WebAssembly support",
    softwareVersion: "2.1.1",
    isAccessibleForFree: true,
    inLanguage: ["zh-CN", "en"],
    codeRepository: "https://github.com/al01cn/mcsd2",
    author: {
      "@type": "Person",
      name: "al01cn",
      url: "https://github.com/al01cn",
    },
  };

  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full" suppressHydrationWarning>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
          }}
        />
        {children}
      </body>
    </html>
  );
}
