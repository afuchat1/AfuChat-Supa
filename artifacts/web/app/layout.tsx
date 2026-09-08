import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AfuChat",
  description: "AfuChat — a social home for everyone.",
  icons: { icon: "/images/icon.png" },
  robots: { index: false, follow: false }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}