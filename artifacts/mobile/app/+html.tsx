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
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />

        <meta name="application-name" content="AfuChat" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="AfuChat" />
        <meta name="description" content="AfuChat — Connect, Chat, Discover. Your all-in-one social platform." />
        <meta name="theme-color" content="#00C2CB" />

        <meta property="og:title" content="AfuChat" />
        <meta property="og:description" content="Connect, Chat, Discover. Your all-in-one social platform." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://afuchat.com" />

        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="AfuChat" />
        <meta name="twitter:description" content="Connect, Chat, Discover. Your all-in-one social platform." />

        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/logo.png" />

        <ScrollViewStyleReset />

        <style dangerouslySetInnerHTML={{ __html: `
          html, body { height: 100%; margin: 0; padding: 0; }
          body { overflow: hidden; }
          #root { display: flex; height: 100%; flex: 1; }

          @media (min-width: 768px) {
            body {
              display: flex;
              justify-content: center;
              align-items: stretch;
              background-color: #f0f0f0;
            }
            body[data-theme="dark"] {
              background-color: #1a1a1a;
            }
            #root {
              max-width: 480px;
              width: 100%;
              margin: 0 auto;
              box-shadow: 0 0 40px rgba(0,0,0,0.15);
              position: relative;
            }
          }

          @media (min-width: 1024px) {
            #root {
              max-width: 420px;
              border-left: 1px solid rgba(0,0,0,0.1);
              border-right: 1px solid rgba(0,0,0,0.1);
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
