import type { Metadata } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://afuchat.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "AfuChat — Connect, create, and belong",
    template: "%s | AfuChat"
  },
  description:
    "AfuChat brings private messaging, communities, short videos, AfuAI, and everyday value into one social app built for Africa and the world.",
  applicationName: "AfuChat",
  keywords: [
    "AfuChat",
    "African social app",
    "private messaging",
    "online communities",
    "short videos",
    "AfuAI"
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "AfuChat",
    title: "AfuChat — Connect, create, and belong",
    description:
      "One place for your people, your ideas, and your everyday moments.",
    images: [{ url: "/images/icon.png", width: 512, height: 512, alt: "AfuChat app icon" }]
  },
  twitter: {
    card: "summary",
    title: "AfuChat — Connect, create, and belong",
    description:
      "Private messaging, communities, short videos, AfuAI, and more in one app.",
    images: ["/images/icon.png"]
  },
  icons: { icon: "/images/icon.png", apple: "/images/icon.png" }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "AfuChat",
    applicationCategory: "SocialNetworkingApplication",
    operatingSystem: "Web",
    description: "AfuChat brings private messaging, communities, short videos, AfuAI, and everyday value into one social app.",
    url: siteUrl
  };

  return (
    <html lang="en">
      <body>
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </body>
    </html>
  );
}