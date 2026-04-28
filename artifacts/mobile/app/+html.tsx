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

        <title>AfuChat — Uganda's Super App | Chat, Discover, Connect</title>

        <meta name="application-name" content="AfuChat" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="AfuChat" />
        <meta name="description" content="AfuChat is Uganda's #1 super app — built in Entebbe, Kitooro. Chat in real time, discover trending content, share moments, send money, and build your community. The all-in-one social platform for Uganda and Africa." />
        <meta name="theme-color" content="#00BCD4" />
        <meta name="keywords" content="AfuChat, Uganda super app, Uganda social media, chat app Uganda, messaging Uganda, social platform Uganda, best app Uganda, super app Africa, Entebbe app, Uganda chat, connect Uganda, Uganda community, Uganda trending, AfuChat Uganda, Uganda mobile app, Uganda fintech app, send money Uganda, Uganda social network" />
        <meta name="author" content="AfuChat — Entebbe, Uganda" />
        <meta name="robots" content="index, follow" />
        <meta name="googlebot" content="index, follow, max-video-preview:-1, max-image-preview:large, max-snippet:-1" />

        <meta name="geo.region" content="UG" />
        <meta name="geo.placename" content="Entebbe, Kitooro, Uganda" />
        <meta name="geo.position" content="0.0512;32.4637" />
        <meta name="ICBM" content="0.0512, 32.4637" />

        <link rel="canonical" href="https://afuchat.com" />

        <meta property="og:site_name" content="AfuChat" />
        <meta property="og:title" content="AfuChat — Uganda's Super App | Chat, Discover, Connect" />
        <meta property="og:description" content="Uganda's #1 super app. Chat in real time, discover trending content, share moments, and build your community. Built in Entebbe, Kitooro." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://afuchat.com" />
        <meta property="og:image" content="https://afuchat.com/logo.png" />
        <meta property="og:image:width" content="512" />
        <meta property="og:image:height" content="512" />
        <meta property="og:image:alt" content="AfuChat Logo" />
        <meta property="og:locale" content="en_UG" />
        <meta property="og:locale:alternate" content="en_US" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content="@afuchat" />
        <meta name="twitter:title" content="AfuChat — Uganda's Super App | Chat, Discover, Connect" />
        <meta name="twitter:description" content="Uganda's #1 super app. Chat in real time, discover trending content, share moments, and build your community. Built in Entebbe, Kitooro." />
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
              "description": "AfuChat is Uganda's #1 super app — built in Entebbe, Kitooro. Chat in real time, discover trending content, share moments, send money, and build your community.",
              "applicationCategory": "SocialNetworkingApplication",
              "operatingSystem": "Android, iOS, Web",
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "UGX"
              },
              "author": {
                "@type": "Organization",
                "name": "AfuChat",
                "url": "https://afuchat.com",
                "address": {
                  "@type": "PostalAddress",
                  "addressLocality": "Entebbe",
                  "addressRegion": "Kitooro",
                  "addressCountry": "UG"
                },
                "areaServed": ["UG", "Africa"],
                "foundingLocation": "Entebbe, Uganda"
              },
              "sameAs": [
                "https://play.google.com/store/apps/details?id=com.afuchat.app"
              ],
              "keywords": "Uganda super app, Uganda social media, super app Uganda, chat Uganda, AfuChat"
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

          body { background-color: #FDF8F3; }

          @media (prefers-color-scheme: dark) {
            body { background-color: #000000; }
          }

          /* Desktop: drop the custom Inter font and use the OS system stack */
          @media (min-width: 1024px) {
            html, body, [data-font="system"], [data-font="system"] * {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
                "Helvetica Neue", Arial, "Noto Sans", sans-serif !important;
              letter-spacing: 0 !important;
            }
            /* Keep icon fonts intact (Ionicons, Material) */
            [class*="ionicon"], [class*="material-icon"], [class*="MaterialCommunityIcons"],
            [class*="FontAwesome"], [data-icon] {
              font-family: inherit !important;
            }
          }
        `}} />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
