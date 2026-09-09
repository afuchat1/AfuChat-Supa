import type { Metadata } from "next";
import "./globals.css";
import { PUBLIC_SITE_URL } from "../lib/site";

export const metadata: Metadata = {
  title: "AfuChat",
  description: "AfuChat — a social home for everyone.",
  metadataBase: new URL(PUBLIC_SITE_URL),
  icons: { icon: "/images/icon.png" },
  openGraph: {
    title: "AfuChat",
    description: "AfuChat — a social home for everyone.",
    type: "website"
  },
  twitter: { card: "summary_large_image", title: "AfuChat", description: "AfuChat — a social home for everyone." }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}