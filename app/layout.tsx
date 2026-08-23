import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

const description =
  "A public directory for Insta360 Spatial Captures, connected to an independent WebXR viewer.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const rawHost = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const host = rawHost.replace(/[^A-Za-z0-9.:[\]-]/g, "") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol === "http" ? "http" : "https"}://${host}`;

  return {
    metadataBase: new URL(origin),
    title: {
      default: "Splat Atlas",
      template: "%s — Splat Atlas",
    },
    description,
    icons: {
      icon: "/favicon.png",
      shortcut: "/favicon.png",
    },
    openGraph: {
      type: "website",
      url: origin,
      title: "Splat Atlas",
      description,
      images: [{ url: `${origin}/og.png`, width: 1200, height: 630, alt: "Splat Atlas — Public Spatial Capture Directory" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Splat Atlas",
      description,
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
