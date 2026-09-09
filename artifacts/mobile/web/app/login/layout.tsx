import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in | AfuChat",
  description: "Sign in to your AfuChat account.",
  robots: { index: false, follow: false }
};

export default function LoginLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}