import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
function encodeUuidToShort(uuid: string): string {
  const hex = uuid.replace(/-/g, "");
  let num = BigInt("0x" + hex);
  if (num === 0n) return B62[0];
  let r = "";
  const base = BigInt(B62.length);
  while (num > 0n) { r = B62[Number(num % base)] + r; num = num / base; }
  return r;
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const SITE_URL = "https://afuchat.com";

router.get("/.well-known/assetlinks.json", (_req, res) => {
  res.type("application/json").send(JSON.stringify([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "com.afuchat.app",
        sha256_cert_fingerprints: [
          process.env.ANDROID_SHA256_FINGERPRINT || "TO_BE_CONFIGURED"
        ]
      }
    }
  ]));
});

router.get("/.well-known/apple-app-site-association", (_req, res) => {
  res.type("application/json").send(JSON.stringify({
    applinks: {
      apps: [],
      details: [
        {
          appID: `${process.env.APPLE_TEAM_ID || "TEAMID"}.com.afuchat.app`,
          paths: ["*"]
        }
      ]
    }
  }));
});

router.get("/robots.txt", (_req, res) => {
  res.type("text/plain").send(`User-agent: *
Allow: /
Allow: /@*
Allow: /p/*
Allow: /post/*
Disallow: /api/
Disallow: /admin/
Disallow: /__mockup/

Sitemap: ${SITE_URL}/sitemap.xml
`);
});

router.get("/sitemap.xml", async (_req, res) => {
  const profiles: any[] = [];
  const posts: any[] = [];
  if (supabase) {
    const [profileResult, postResult] = await Promise.all([
      supabase.from("profiles").select("handle, updated_at").eq("is_private", false).not("handle", "like", "deleted_%").order("updated_at", { ascending: false }).limit(1000),
      supabase.from("posts").select("id, created_at, author:profiles!author_id(is_private)").eq("is_blocked", false).order("created_at", { ascending: false }).limit(2000),
    ]);
    profiles.push(...(profileResult.data || []));
    posts.push(...(postResult.data || []));
  }

  const profileUrls = profiles.map((p) => `
  <url>
    <loc>${SITE_URL}/@${p.handle}</loc>
    <lastmod>${new Date(p.updated_at || Date.now()).toISOString().split("T")[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`).join("");

  const publicPosts = posts.filter((p) => !p.author?.is_private);
  const postUrls = publicPosts.map((p) => `
  <url>
    <loc>${SITE_URL}/p/${encodeUuidToShort(p.id)}</loc>
    <lastmod>${new Date(p.created_at || Date.now()).toISOString().split("T")[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>`).join("");

  res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${SITE_URL}/terms</loc>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>${SITE_URL}/privacy</loc>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>${profileUrls}${postUrls}
</urlset>`);
});

function ogHtml(params: {
  title: string;
  description: string;
  image?: string;
  url: string;
  type?: string;
  author?: string;
  publishedAt?: string;
}): string {
  const { title, description, image = `${SITE_URL}/logo.png`, url, type = "article", author, publishedAt } = params;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}"/>
  <meta name="robots" content="index,follow"/>
  <link rel="canonical" href="${esc(url)}"/>
  <meta property="og:site_name" content="AfuChat"/>
  <meta property="og:type" content="${type}"/>
  <meta property="og:title" content="${esc(title)}"/>
  <meta property="og:description" content="${esc(description)}"/>
  <meta property="og:image" content="${esc(image)}"/>
  <meta property="og:url" content="${esc(url)}"/>
  ${author ? `<meta property="article:author" content="${esc(author)}"/>` : ""}
  ${publishedAt ? `<meta property="article:published_time" content="${publishedAt}"/>` : ""}
  <meta name="twitter:card" content="${image !== `${SITE_URL}/logo.png` ? "summary_large_image" : "summary"}"/>
  <meta name="twitter:site" content="@afuchat"/>
  <meta name="twitter:title" content="${esc(title)}"/>
  <meta name="twitter:description" content="${esc(description)}"/>
  <meta name="twitter:image" content="${esc(image)}"/>
  <script>
    // Redirect to app for non-bot visitors
    var ua = navigator.userAgent;
    var isBot = /bot|crawler|spider|facebookexternalhit|Twitterbot|Slackbot|WhatsApp|Discordbot/i.test(ua);
    if (!isBot) { window.location.replace(${JSON.stringify(url)}); }
  </script>
</head>
<body>
  <h1>${esc(title)}</h1>
  <p>${esc(description)}</p>
  <p><a href="${esc(url)}">View on AfuChat</a></p>
</body>
</html>`;
}

router.get("/og/post/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { data } = await supabase
      .from("posts")
      .select("id, content, image_url, created_at, article_title, post_images(image_url, display_order), profiles!posts_author_id_fkey(display_name, handle)")
      .eq("id", id)
      .eq("is_blocked", false)
      .single();

    if (!data) { res.status(404).send("Not found"); return; }

    const p = data as any;
    const images: string[] = (p.post_images || []).sort((a: any, b: any) => a.display_order - b.display_order).map((i: any) => i.image_url);
    const coverImage = images[0] || p.image_url || undefined;
    const content = (p.article_title || p.content || "").slice(0, 200);
    const author = p.profiles?.display_name || "AfuChat User";
    const handle = p.profiles?.handle || "user";
    const title = p.article_title
      ? `${p.article_title} — by ${author} on AfuChat`
      : `${author} on AfuChat: "${content.slice(0, 80)}${content.length > 80 ? "…" : ""}"`;
    const url = `${SITE_URL}/p/${encodeUuidToShort(p.id)}`;

    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    res.type("text/html").send(ogHtml({ title, description: content, image: coverImage, url, author: `${SITE_URL}/@${handle}`, publishedAt: p.created_at }));
  } catch (err) {
    res.status(500).send("Error");
  }
});

router.get("/og/profile/:handle", async (req, res) => {
  try {
    const { handle } = req.params;
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name, handle, bio, avatar_url")
      .eq("handle", handle)
      .eq("is_private", false)
      .single();

    if (!data) { res.status(404).send("Not found"); return; }

    const p = data as any;
    const title = `${p.display_name} (@${p.handle}) — AfuChat`;
    const description = p.bio ? p.bio.slice(0, 200) : `Follow ${p.display_name} on AfuChat.`;
    const url = `${SITE_URL}/@${p.handle}`;

    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    res.type("text/html").send(ogHtml({ title, description, image: p.avatar_url || undefined, url, type: "profile", author: p.display_name }));
  } catch (err) {
    res.status(500).send("Error");
  }
});

export default router;
