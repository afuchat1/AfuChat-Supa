const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'artifacts', 'mobile', 'dist', 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

const seoTags = `
    <meta name="description" content="AfuChat is your all-in-one social platform. Connect with friends, chat in real time, discover trending content, share moments, and build your community. Available on Android, iOS, and Web." />
    <meta name="theme-color" content="#00897B" />
    <meta name="keywords" content="AfuChat, social media, chat app, messaging, discover, connect, community, social platform, real-time chat, moments, stories" />
    <meta name="author" content="AfuChat" />
    <meta name="robots" content="index, follow" />
    <meta name="googlebot" content="index, follow, max-video-preview:-1, max-image-preview:large, max-snippet:-1" />
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
    <link rel="icon" href="/favicon.ico" />
    <link rel="icon" type="image/png" sizes="32x32" href="/logo.png" />
    <link rel="apple-touch-icon" href="/logo.png" />
    <script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebApplication",
      "name": "AfuChat",
      "url": "https://afuchat.com",
      "description": "AfuChat is your all-in-one social platform. Connect with friends, chat in real time, discover trending content, share moments, and build your community.",
      "applicationCategory": "SocialNetworkingApplication",
      "operatingSystem": "Android, iOS, Web",
      "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
      "author": { "@type": "Organization", "name": "AfuChat", "url": "https://afuchat.com" }
    })}</script>`;

html = html.replace(/<meta name="theme-color" content="#34A853">\n?/g, '');
html = html.replace(/<meta name="description" content="Connect, Chat, Discover\. Your all-in-one social platform\.">\n?/g, '');

if (html.includes('<title>AfuChat</title>')) {
  html = html.replace('<title>AfuChat</title>', '<title>AfuChat \u2014 Connect, Chat, Discover</title>' + seoTags);
} else if (!html.includes('og:title')) {
  html = html.replace('</head>', seoTags + '\n  </head>');
}

fs.writeFileSync(indexPath, html, 'utf8');
console.log('SEO meta tags injected into index.html');
