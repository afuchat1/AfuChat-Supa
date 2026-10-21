import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { injectMeta, publicProfileSummaries, profileContent } from "./public-crawler.mjs";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..", "dist");

const routeCopy = {
  "/": {
    title: "AfuChat — Connect, share, and chat",
    description: "AfuChat is a social platform for messaging, communities, posts, stories, video, and AI-powered conversations.",
    body: `
      <h1>AfuChat</h1>
      <p>Connect with people, share moments, join communities, and chat on AfuChat.</p>
      <nav aria-label="AfuChat">
        <a href="/welcome">Get started</a>
        <a href="/discover">Discover public content</a>
        <a href="/about">About AfuChat</a>
        <a href="/help">Help and support</a>
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
      </nav>
    `,
  },
  "/about": {
    title: "About AfuChat",
    description: "Learn about AfuChat, a social platform for messaging, communities, and sharing moments.",
    body: "<h1>About AfuChat</h1><p>AfuChat brings messaging, communities, stories, video, payments, and AI-powered conversations together in one social platform.</p>",
  },
  "/discover": {
    title: "Discover public content on AfuChat",
    description: "Explore public posts, creators, communities, and videos on AfuChat.",
    body: "<h1>Discover AfuChat</h1><p>Explore public posts, creators, communities, stories, and videos shared on AfuChat.</p>",
  },
  "/privacy": {
    title: "Privacy Policy — AfuChat",
    description: "Read the AfuChat privacy policy.",
    body: "<h1>Privacy Policy</h1><p>Read how AfuChat handles account, device, and public content data.</p>",
  },
  "/terms": {
    title: "Terms of Service — AfuChat",
    description: "Read the AfuChat terms of service.",
    body: "<h1>Terms of Service</h1><p>Read the terms that apply when using AfuChat.</p>",
  },
  "/help": {
    title: "Help and Support — AfuChat",
    description: "Get help with your AfuChat account and app.",
    body: "<h1>AfuChat Help and Support</h1><p>Find help with your account, privacy, messaging, and app features.</p>",
  },
};

function routeForFile(fileName) {
  if (fileName === "index.html") return "/";
  if (!fileName.endsWith(".html")) return null;
  const route = `/${fileName.slice(0, -".html".length)}`;
  return route.replace(/\/index$/, "");
}

function escapeAttribute(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function fallbackFor(route) {
  return routeCopy[route] || {
    title: `${route === "/" ? "AfuChat" : "AfuChat — " + route.slice(1)} `,
    description: "Use AfuChat to connect, share, message, and discover public content.",
    body: `<h1>AfuChat</h1><p>Use AfuChat to connect, share, message, and discover public content.</p><p><a href="/">Return to AfuChat</a></p>`,
  };
}

async function htmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await htmlFiles(path)));
    else if (entry.isFile() && entry.name.endsWith(".html")) files.push(path);
  }
  return files;
}

const files = await htmlFiles(root);
let generatedProfiles = 0;
try {
  const template = await readFile(join(root, "[handle].html"), "utf8");
  const profiles = await publicProfileSummaries();
  for (const profile of Array.isArray(profiles) ? profiles : []) {
    const handle = String(profile?.handle || "").trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(handle)) continue;
    if (routeCopy[`/${handle}`] || handle === "index") continue;
    const content = profileContent({
      profile,
      followers: null,
      following: null,
      posts: null,
      grid: [],
    });
    const title = content.title.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
    const description = content.description.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
    const canonicalUrl = `https://afuchat.com/${encodeURIComponent(handle)}`;
    const profilePage = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <link rel="canonical" href="${canonicalUrl}">
  <meta property="og:type" content="profile">
  <meta property="og:site_name" content="AfuChat">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta name="robots" content="index,follow">
  <style>
    :root{color-scheme:light dark;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    *{box-sizing:border-box}body{margin:0;background:#f5f7fa;color:#172033;line-height:1.65}
    header{background:#fff;border-bottom:1px solid #e5e9f0;padding:16px 20px}
    header a{font-weight:750;color:#2563eb;text-decoration:none;font-size:20px}
    main{width:min(760px,calc(100% - 32px));margin:32px auto;background:#fff;border:1px solid #e5e9f0;border-radius:18px;padding:clamp(22px,5vw,42px);overflow-wrap:anywhere}
    h1{line-height:1.2;font-size:clamp(26px,5vw,36px);margin-top:0;color:#111827}
    h2{font-size:20px;margin-top:28px}p{color:#374151}a{color:#2563eb}img{max-width:100%;height:auto;border-radius:12px}
    footer{text-align:center;color:#6b7280;padding:12px 20px 32px;font-size:14px}
    @media(prefers-color-scheme:dark){body{background:#10141c;color:#e5e7eb}header,main{background:#171d28;border-color:#2b3443}h1{color:#f9fafb}p{color:#d1d5db}footer{color:#9ca3af}}
  </style>
</head>
<body>
  <header><a href="https://afuchat.com/">AfuChat</a></header>
  <main>
    ${content.html}
    <p><a href="https://afuchat.com/welcome">Open AfuChat</a></p>
  </main>
  <footer>Public profile on AfuChat</footer>
</body>
</html>`;
    await writeFile(join(root, `${handle}.html`), profilePage);
    generatedProfiles += 1;
  }
} catch (error) {
  console.warn(`[static-web] profile prerender skipped: ${error?.message || error}`);
}

let updated = 0;
for (const filePath of files) {
  const html = await readFile(filePath, "utf8");
  if (html.includes('id="afuchat-nojs-content"')) continue;

  const route = routeForFile(relative(root, filePath).replaceAll("\\", "/"));
  if (!route) continue;
  const copy = fallbackFor(route);
  const title = escapeAttribute(copy.title.trim());
  const description = escapeAttribute(copy.description);
  const canonicalUrl = routeCopy[route] ? `https://afuchat.com${route === "/" ? "" : route}` : null;
  const canonicalMetadata = canonicalUrl
    ? `\n    <link rel="canonical" href="${escapeAttribute(canonicalUrl)}">\n    <meta property="og:url" content="${escapeAttribute(canonicalUrl)}">\n  `
    : "";
  const fallback = `
    <noscript>
      <main id="afuchat-nojs-content" aria-label="${title}">
        ${copy.body}
      </main>
    </noscript>
  `;
  const metadata = `
    <title>${title}</title>
    <meta name="description" content="${description}">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    ${canonicalMetadata}
  `;

  const enhanced = html
    .replace("</head>", `${metadata}</head>`)
    .replace("</body>", `${fallback}</body>`);
  await writeFile(filePath, enhanced);
  updated += 1;
}

const publicUrls = Object.keys(routeCopy).map((route) => `https://afuchat.com${route === "/" ? "" : route}`);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${publicUrls.map((url) => `  <url><loc>${url}</loc></url>`).join("\n")}\n</urlset>\n`;
await writeFile(join(root, "sitemap.xml"), sitemap);
await writeFile(join(root, "robots.txt"), "User-agent: *\nAllow: /\nSitemap: https://afuchat.com/sitemap.xml\n");

console.log(`[static-web] added crawlable fallback content to ${updated} HTML routes, prerendered ${generatedProfiles} public profiles, and generated canonical metadata plus sitemap.xml and robots.txt`);