import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, shrink-to-fit=no, viewport-fit=cover"
        />

        <title>AfuChat — Connect, Chat, Discover</title>

        <meta name="application-name" content="AfuChat" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="AfuChat" />
        <meta name="description" content="AfuChat is your all-in-one social platform. Connect with friends, chat in real time, discover trending content, share moments, and build your community. Available on Android, iOS, and Web." />
        <meta name="theme-color" content="#00897B" />
        <meta name="keywords" content="AfuChat, social media, chat app, messaging, discover, connect, community, social platform, real-time chat, moments, stories" />
        <meta name="author" content="AfuChat" />
        <meta name="robots" content="index, follow" />
        <meta name="googlebot" content="index, follow, max-video-preview:-1, max-image-preview:large, max-snippet:-1" />

        <link rel="canonical" href="https://afuchat.com" />

        <meta property="og:site_name" content="AfuChat" />
        <meta property="og:title" content="AfuChat — Connect, Chat, Discover" />
        <meta property="og:description" content="Your all-in-one social platform. Chat in real time, discover trending content, share moments, and build your community." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://afuchat.com" />
        <meta property="og:image" content="https://afuchat.com/logo.png" />
        <meta property="og:image:width" content="512" />
        <meta property="og:image:height" content="512" />
        <meta property="og:image:alt" content="AfuChat Logo" />
        <meta property="og:locale" content="en_US" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content="@afuchat" />
        <meta name="twitter:title" content="AfuChat — Connect, Chat, Discover" />
        <meta name="twitter:description" content="Your all-in-one social platform. Chat in real time, discover trending content, share moments, and build your community." />
        <meta name="twitter:image" content="https://afuchat.com/logo.png" />

        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="icon" type="image/png" sizes="32x32" href="/logo.png" />
        <link rel="apple-touch-icon" href="/logo.png" />

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              "name": "AfuChat",
              "url": "https://afuchat.com",
              "description": "AfuChat is your all-in-one social platform. Connect with friends, chat in real time, discover trending content, share moments, and build your community.",
              "applicationCategory": "SocialNetworkingApplication",
              "operatingSystem": "Android, iOS, Web",
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "USD"
              },
              "author": {
                "@type": "Organization",
                "name": "AfuChat",
                "url": "https://afuchat.com"
              },
              "sameAs": [
                "https://play.google.com/store/apps/details?id=com.afuchat.app"
              ]
            }),
          }}
        />

        <ScrollViewStyleReset />

        <style dangerouslySetInnerHTML={{ __html: `
          html, body { height: 100%; margin: 0; padding: 0; overflow: hidden; width: 100%; max-width: 100vw; }
          body { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
          * { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; touch-action: manipulation; box-sizing: border-box; }
          input, textarea, [contenteditable] { -webkit-user-select: text; user-select: text; }
          #root { display: flex; height: 100%; flex: 1; width: 100%; max-width: 100vw; overflow: hidden; }

          /* Polished thin scrollbars on web */
          ::-webkit-scrollbar { width: 5px; height: 5px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.25); border-radius: 10px; }
          ::-webkit-scrollbar-thumb:hover { background: rgba(0,188,212,0.5); }
          * { scrollbar-width: thin; scrollbar-color: rgba(128,128,128,0.25) transparent; }

          /* Pointer cursor on interactive elements */
          [role="button"], button, a, [data-testid] { cursor: pointer !important; }

          /* Mobile web: narrow centered shell */
          @media (max-width: 767px) {
            body { background-color: #f0ece7; }
          }

          /* Desktop: full-width, DesktopWrapper handles layout */
          @media (min-width: 768px) {
            body { background-color: #eef0f4; }
            #root { width: 100%; }
          }

          @media (prefers-color-scheme: dark) {
            body { background-color: #0a0a0a; }
          }
        `}} />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
