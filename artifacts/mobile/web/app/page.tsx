"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const languages = [
  ["en", "English", "🇬🇧"],
  ["sw", "Swahili", "🇰🇪"],
  ["fr", "French", "🇫🇷"],
  ["es", "Spanish", "🇪🇸"],
  ["ar", "Arabic", "🇸🇦"],
  ["zh", "Chinese", "🇨🇳"],
  ["am", "Amharic", "🇪🇹"],
  ["rw", "Kinyarwanda", "🇷🇼"]
] as const;

const slides = [
  { title: "Connect with\npurpose", subtitle: "Have conversations that matter, with people who get you.", action: "Keep going", image: "/illustrations/messaging.webp", accent: "#1018D8", accentAlt: "#7B5EA7" },
  { title: "Find your\npeople", subtitle: "Discover communities and friendships that feel like home.", action: "Find my people", image: "/illustrations/community.webp", accent: "#AF52DE", accentAlt: "#FF6B9D" },
  { title: "Create. Share.\nBe seen.", subtitle: "Turn your ideas and moments into something worth sharing.", action: "Start creating", image: "/illustrations/ai.webp", accent: "#FF9500", accentAlt: "#FF6B35" },
  { title: "Your activity\nhas value", subtitle: "AfuChat gives your everyday social activity more value.", action: "Get started", image: "/illustrations/wallet.webp", accent: "#34C759", accentAlt: "#00D4AA" }
] as const;

export default function HomePage() {
  const [language, setLanguage] = useState<string | null>(null);
  const [languageComplete, setLanguageComplete] = useState(false);
  const [slide, setSlide] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("afuchat_language");
    setLanguage(stored);
    setLanguageComplete(Boolean(stored));
    setReady(true);
  }, []);

  if (!ready) return <main className="screen" />;
  if (!language || !languageComplete) {
    return (
      <main className="screen">
        <Background />
        <div className="onboarding-shell">
          <section className="onboarding-content">
            <Brand />
            <div className="hero">
              <div className="planet" aria-hidden="true">🌍</div>
              <h1>Choose your language</h1>
              <p>Select the language you understand best. We will use it to make your AfuChat experience easier to follow.</p>
            </div>
            <div className="language-list" role="radiogroup" aria-label="Choose your language">
              {languages.map(([code, label, flag]) => (
                <button key={code} className={`language-row ${language === code ? "selected" : ""}`} onClick={() => setLanguage(code)} role="radio" aria-checked={language === code}>
                  <span className="flag-bubble">{flag}</span>
                  <span className="language-name">{label}</span>
                  <span className="radio" />
                </button>
              ))}
            </div>
            <div className="bottom">
              <button className="continue" disabled={!language} onClick={() => { if (language) { window.localStorage.setItem("afuchat_language", language); setLanguageComplete(true); } }}>
                {language ? "Continue" : "Choose a language"} <span>→</span>
              </button>
              <p className="hint">{language ? "You can change this later in Settings." : "Select one option to continue."}</p>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const current = slides[slide];
  return (
    <main className="screen">
      <Background />
      <div className="slide-shell">
        <section className="slide-content">
          <div className="slide-top">
            <Brand compact />
            <Link className="skip" href="/login">Skip</Link>
          </div>
          <div className="slide-illustration">
            <img src={current.image} alt="" />
          </div>
          <div className="slide-card" style={{ "--accent": current.accent, "--accent-alt": current.accentAlt } as React.CSSProperties}>
            <h1>{current.title}</h1>
            <p>{current.subtitle}</p>
            <div className="progress" aria-label={`Step ${slide + 1} of ${slides.length}`}>
              {slides.map((_, index) => <button key={index} className={index === slide ? "active" : ""} style={{ "--accent": current.accent } as React.CSSProperties} onClick={() => setSlide(index)} aria-label={`Go to step ${index + 1}`} />)}
            </div>
            <button className="slide-next" onClick={() => slide < slides.length - 1 ? setSlide(slide + 1) : window.location.assign("/login")} style={{ "--accent": current.accent, "--accent-alt": current.accentAlt } as React.CSSProperties}>{current.action} <span>→</span></button>
            <p className="signin-hint">Already have an account? <Link href="/login">Sign in</Link></p>
          </div>
        </section>
      </div>
    </main>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? "slide-brand" : ""}`}><img src="/images/white-logo-bold.png" alt="" /><span>AfuChat</span></div>;
}

function Background() {
  return <><div className="orb one" /><div className="orb two" /><div className="orb three" /></>;
}