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
    await writeFile(join(root, `${handle}.html`), injectMeta(template, content));
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
  `;

  const enhanced = html
    .replace("</head>", `${metadata}</head>`)
    .replace("</body>", `${fallback}</body>`);
  await writeFile(filePath, enhanced);
  updated += 1;
}

console.log(`[static-web] added crawlable fallback content to ${updated} HTML routes and prerendered ${generatedProfiles} public profiles`);