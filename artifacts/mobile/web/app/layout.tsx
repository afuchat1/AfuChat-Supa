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
      <body>
        {children}
        <noscript>
          <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px", fontFamily: "Arial, sans-serif", lineHeight: 1.6 }}>
            <h1>AfuChat — a social home for everyone.</h1>
            <p>
              Connect with people, discover communities, and share what matters to you.
              AfuChat is available on the web and on mobile.
            </p>
            <nav aria-label="AfuChat links">
              <a href="/login">Sign in</a>
              {" · "}
              <a href="/discover">Discover AfuChat</a>
              {" · "}
              <a href="/about">About AfuChat</a>
            </nav>
          </main>
        </noscript>
      </body>
    </html>
  );
}