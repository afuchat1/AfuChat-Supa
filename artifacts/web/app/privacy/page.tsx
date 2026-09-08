import Link from "next/link";

export const metadata = {
  title: "Privacy",
  description: "Learn how AfuChat approaches privacy and keeps your conversations yours.",
  alternates: { canonical: "/privacy" }
};

export default function PrivacyPage() {
  return <main className="simple-page"><Link className="brand" href="/"><span className="brand-word">AfuChat</span></Link><article><p className="eyebrow">AfuChat</p><h1>Privacy, without the fine-print fog.</h1><p>We believe your conversations belong to you. This web preview uses illustrative content and does not ask for personal data.</p><Link className="underlined-link" href="/">Back to AfuChat <span>↗</span></Link></article></main>;
}